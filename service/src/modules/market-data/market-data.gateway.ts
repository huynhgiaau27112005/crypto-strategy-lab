import { BadRequestException, Logger, OnModuleDestroy } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { BinanceClient, KlineStreamHandle, KlineUpdate } from './clients/binance.client';
import { CandleRepository } from './repositories/candle.repository';
import { assertAllowedInterval } from './config';

// Market scope is fixed for this project: Binance, BTCUSDT only.
const SYMBOL = 'BTCUSDT';

interface CandleBroadcast {
    interval: string;
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
}

interface StatusBroadcast {
    connected: boolean;
    interval: string;
    lastMessageAt: string | null;
}

interface StreamState {
    connected: boolean;
    handle: KlineStreamHandle;
}

/**
 * Pushes live BTCUSDT candle updates to subscribed clients instead of
 * requiring the frontend to poll a price endpoint (required flow #2).
 *
 * One upstream Binance stream is kept per interval, ref-counted by room
 * membership: the first `subscribe` for an interval opens the upstream
 * stream, the last matching disconnect/`unsubscribe` tears it down.
 */
@WebSocketGateway({
    namespace: '/market',
    cors: {
        origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
        credentials: true,
    },
})
export class MarketDataGateway
    implements OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(MarketDataGateway.name);

    // interval -> live upstream stream state (one per interval, ref-counted below).
    private readonly streams = new Map<string, StreamState>();

    // interval -> set of subscribed socket ids. The size of each set is the
    // ref-count that decides when to open/close the matching upstream stream.
    private readonly subscribers = new Map<string, Set<string>>();

    constructor(
        private readonly binanceClient: BinanceClient,
        private readonly candleRepository: CandleRepository,
    ) { }

    @SubscribeMessage('subscribe')
    handleSubscribe(
        @ConnectedSocket() client: Socket,
        @MessageBody() body: { interval?: string },
    ): void {
        const interval = body?.interval ?? '';
        try {
            assertAllowedInterval(interval);
        } catch (error) {
            client.emit('error', {
                message:
                    error instanceof BadRequestException
                        ? error.message
                        : `Unsupported interval "${interval}".`,
            });
            return;
        }

        void client.join(this.roomName(interval));

        let subscriberIds = this.subscribers.get(interval);
        if (!subscriberIds) {
            subscriberIds = new Set();
            this.subscribers.set(interval, subscriberIds);
        }
        const isFirstSubscriber = subscriberIds.size === 0;
        subscriberIds.add(client.id);

        if (isFirstSubscriber) {
            this.ensureStream(interval);
        }

        client.emit('status', this.currentStatus(interval));
    }

    @SubscribeMessage('unsubscribe')
    handleUnsubscribe(
        @ConnectedSocket() client: Socket,
        @MessageBody() body: { interval?: string },
    ): void {
        const interval = body?.interval;
        if (!interval) {
            return;
        }
        void client.leave(this.roomName(interval));
        this.removeSubscriber(interval, client.id);
    }

    handleDisconnect(client: Socket): void {
        for (const interval of [...this.subscribers.keys()]) {
            this.removeSubscriber(interval, client.id);
        }
    }

    onModuleDestroy(): void {
        for (const interval of [...this.streams.keys()]) {
            this.streams.get(interval)?.handle.stop();
        }
        this.streams.clear();
        this.subscribers.clear();
    }

    private removeSubscriber(interval: string, socketId: string): void {
        const subscriberIds = this.subscribers.get(interval);
        if (!subscriberIds || !subscriberIds.has(socketId)) {
            return;
        }
        subscriberIds.delete(socketId);
        if (subscriberIds.size === 0) {
            this.subscribers.delete(interval);
            this.teardownStream(interval);
        }
    }

    private ensureStream(interval: string): void {
        if (this.streams.has(interval)) {
            return;
        }

        const state: StreamState = {
            connected: false,
            // Set immediately below; declared here so callbacks can close over `state`.
            handle: null as unknown as KlineStreamHandle,
        };

        const handle = this.binanceClient.streamCandles(SYMBOL, interval, {
            onUpdate: (update) => this.handleUpstreamUpdate(interval, update),
            onConnectionChange: (connected) => {
                state.connected = connected;
                this.broadcastStatus(interval);
            },
        });

        state.handle = handle;
        this.streams.set(interval, state);
    }

    private teardownStream(interval: string): void {
        const state = this.streams.get(interval);
        if (!state) {
            return;
        }
        state.handle.stop();
        this.streams.delete(interval);
    }

    private handleUpstreamUpdate(interval: string, update: KlineUpdate): void {
        // Only closed candles are broadcast and persisted — an in-progress
        // candle still mutates and would corrupt the historical series that
        // every backtest reads if written through CandleRepository.
        if (!update.isClosed) {
            return;
        }

        const candle: CandleBroadcast = {
            interval,
            timestamp: new Date(update.timestamp).toISOString(),
            open: update.open,
            high: update.high,
            low: update.low,
            close: update.close,
            volume: update.volume,
        };

        this.server.to(this.roomName(interval)).emit('candle', candle);

        this.candleRepository
            .insertCandles([
                {
                    timeframe: interval,
                    timestamp: new Date(update.timestamp),
                    open: update.open,
                    high: update.high,
                    low: update.low,
                    close: update.close,
                    volume: update.volume,
                },
            ])
            .catch((error: unknown) => {
                this.logger.error(
                    `Failed to persist closed ${interval} candle: ${String(error)}`,
                );
            });
    }

    private broadcastStatus(interval: string): void {
        this.server.to(this.roomName(interval)).emit(
            'status',
            this.currentStatus(interval),
        );
    }

    private currentStatus(interval: string): StatusBroadcast {
        const state = this.streams.get(interval);
        return {
            connected: state?.connected ?? false,
            interval,
            lastMessageAt: state?.handle.getLastMessageAt()?.toISOString() ?? null,
        };
    }

    private roomName(interval: string): string {
        return `interval:${interval}`;
    }
}
