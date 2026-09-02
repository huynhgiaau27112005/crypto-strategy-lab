import { BadRequestException, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import {
    KlineStreamHandle,
    KlineUpdate,
    MARKET_DATA_PROVIDER,
    TradeUpdate,
} from './providers/market-data-provider';
// See MarketDataService for why this one is a type-only import.
import type { MarketDataProvider } from './providers/market-data-provider';
import { CandleRepository } from './repositories/candle.repository';
import { assertAllowedInterval } from './config';
import { MARKET_SCOPE } from '../../common/market-scope';

// One market for the whole deployment — see common/market-scope.ts.
const SYMBOL = MARKET_SCOPE.symbol;

// Single room for the symbol-wide tick feed (there is only one symbol in
// this project's scope, so no per-symbol room naming is needed).
const TRADE_ROOM = 'trades';

interface CandleBroadcast {
    interval: string;
    timestamp: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    /**
     * False while this candle is still forming. Both states are broadcast:
     * dropping the forming ones (the previous behaviour) meant the chart
     * only ever moved once per interval, so a 1m pane was up to a minute
     * behind the market and a 4h pane four hours behind. Consumers redraw
     * the in-progress bar on every update and treat `closed: true` as the
     * bar's final state; only closed candles are persisted.
     */
    closed: boolean;
}

interface TradeBroadcast {
    tradeId: number;
    timestamp: string;
    price: string;
    quantity: string;
    buyerIsMaker: boolean;
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
 * Pushes live candle updates for the configured market (see
 * common/market-scope.ts) to subscribed clients instead of
 * requiring the frontend to poll a price endpoint (required flow #2).
 *
 * One upstream provider stream is kept per interval, ref-counted by room
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

    // Same ref-counting, one level simpler, for the single symbol-wide
    // aggregate-trade stream backing the "Recent ticks" feed.
    private readonly tradeSubscribers = new Set<string>();
    private tradeStream: KlineStreamHandle | null = null;

    constructor(
        // The exchange is chosen once, in MarketDataCoreModule. This
        // gateway pushes whatever the bound provider streams and never
        // names one.
        @Inject(MARKET_DATA_PROVIDER)
        private readonly marketData: MarketDataProvider,
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
            const message = error instanceof Error ? error.message : String(error);
            if (!(error instanceof BadRequestException)) {
                // assertAllowedInterval only ever throws BadRequestException;
                // anything else is unexpected and worth surfacing, not
                // silently mislabelled as "unsupported interval".
                this.logger.warn(
                    `Unexpected error validating interval "${interval}": ${message}`,
                );
            }
            client.emit('error', { message });
            return;
        }

        void client.join(this.roomName(interval));

        let subscriberIds = this.subscribers.get(interval);
        if (!subscriberIds) {
            subscriberIds = new Set();
            this.subscribers.set(interval, subscriberIds);
        }
        subscriberIds.add(client.id);

        // Idempotent: a no-op if a stream is already open for this
        // interval. Called unconditionally (not gated on "first
        // subscriber") so a subscriber that arrives after a previous
        // ensureStream() attempt threw retries opening the upstream
        // instead of the interval being permanently stuck with no stream.
        this.ensureStream(interval);

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

    /**
     * Opt-in tick feed. Kept separate from `subscribe` so a client that only
     * renders charts never pays for the (far busier) trade stream.
     */
    @SubscribeMessage('subscribeTrades')
    handleSubscribeTrades(@ConnectedSocket() client: Socket): void {
        void client.join(TRADE_ROOM);
        this.tradeSubscribers.add(client.id);
        this.ensureTradeStream();
    }

    @SubscribeMessage('unsubscribeTrades')
    handleUnsubscribeTrades(@ConnectedSocket() client: Socket): void {
        void client.leave(TRADE_ROOM);
        this.removeTradeSubscriber(client.id);
    }

    handleDisconnect(client: Socket): void {
        for (const interval of [...this.subscribers.keys()]) {
            this.removeSubscriber(interval, client.id);
        }
        this.removeTradeSubscriber(client.id);
    }

    onModuleDestroy(): void {
        for (const interval of [...this.streams.keys()]) {
            this.streams.get(interval)?.handle.stop();
        }
        this.streams.clear();
        this.subscribers.clear();
        this.tradeStream?.stop();
        this.tradeStream = null;
        this.tradeSubscribers.clear();
    }

    private removeTradeSubscriber(socketId: string): void {
        if (!this.tradeSubscribers.delete(socketId)) return;
        if (this.tradeSubscribers.size === 0) {
            this.tradeStream?.stop();
            this.tradeStream = null;
        }
    }

    private ensureTradeStream(): void {
        if (this.tradeStream) return;
        try {
            this.tradeStream = this.marketData.streamTrades(SYMBOL, {
                onTrade: (trade) => this.handleUpstreamTrade(trade),
            });
        } catch (error) {
            // Same rationale as ensureStream(): never cache a broken handle,
            // so the next subscriber retries instead of the room being dead
            // for the rest of the process's life.
            this.logger.error(
                `Failed to open upstream trade stream: ${String(error)}`,
            );
        }
    }

    private handleUpstreamTrade(trade: TradeUpdate): void {
        const message: TradeBroadcast = {
            tradeId: trade.tradeId,
            timestamp: new Date(trade.timestamp).toISOString(),
            price: trade.price,
            quantity: trade.quantity,
            buyerIsMaker: trade.buyerIsMaker,
        };
        this.server.to(TRADE_ROOM).emit('trade', message);
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

        try {
            const handle = this.marketData.streamCandles(SYMBOL, interval, {
                onUpdate: (update) => this.handleUpstreamUpdate(interval, update),
                onConnectionChange: (connected) => {
                    state.connected = connected;
                    this.broadcastStatus(interval);
                },
            });

            state.handle = handle;
            this.streams.set(interval, state);
        } catch (error) {
            // Do NOT register a broken entry in `this.streams` — leaving one
            // there would make `this.streams.has(interval)` true forever,
            // permanently skipping retries for every later subscriber. The
            // next subscribe() for this interval calls ensureStream() again
            // and gets a fresh attempt.
            this.logger.error(
                `Failed to open upstream stream for interval "${interval}": ${String(error)}`,
            );
        }
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
        const candle: CandleBroadcast = {
            closed: update.isClosed,
            interval,
            timestamp: new Date(update.timestamp).toISOString(),
            open: update.open,
            high: update.high,
            low: update.low,
            close: update.close,
            volume: update.volume,
        };

        this.server.to(this.roomName(interval)).emit('candle', candle);

        // Persist ONLY closed candles: an in-progress candle still mutates,
        // and writing it through CandleRepository would corrupt the
        // historical series every backtest reads. Broadcasting it is safe
        // (the client redraws the same bar); storing it is not.
        if (!update.isClosed) {
            return;
        }

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
