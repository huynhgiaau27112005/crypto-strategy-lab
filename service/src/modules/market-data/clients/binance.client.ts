import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { MetricsService } from '../../../observability/metrics/metrics.service';

export interface BinanceKline {
    openTime: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    closeTime: number;
    /**
     * True once this candle's close time has passed. This is the REST-side
     * equivalent of the `isClosed` flag on {@link KlineUpdate}: the
     * WebSocket stream gets it directly from Binance's `k.x` field, while
     * the REST klines endpoint doesn't expose that flag, so it's derived
     * from `closeTime` here — once, in this file — instead of every caller
     * re-deriving (or forgetting to derive) it independently.
     */
    isClosed: boolean;
}

/**
 * Pure "is this candle closed yet" check shared by every REST kline row.
 * Exported so it can be unit-tested without a network call.
 */
export function isKlineClosed(
    closeTime: number,
    referenceTimeMs: number = Date.now(),
): boolean {
    return referenceTimeMs > closeTime;
}

/**
 * Normalized shape of a single kline (candle) update pushed by Binance's
 * WebSocket stream. Already stripped of Binance's raw field names (`t`,
 * `o`, `h`, `l`, `c`, `v`, `x`, ...) — callers outside this file never see
 * the Binance wire format.
 */
export interface KlineUpdate {
    timestamp: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    /** True only when this update represents the candle's final, closed state. */
    isClosed: boolean;
}

/**
 * One executed aggregate trade (`<symbol>@aggTrade`), normalized the same
 * way {@link KlineUpdate} is. This is the real per-tick feed: a candle
 * stream only ever reports the state of the bar being built, so a
 * "Recent ticks" table fed from klines can never show more than one row
 * per interval — which is exactly the staleness this stream removes.
 */
export interface TradeUpdate {
    tradeId: number;
    timestamp: number;
    price: string;
    quantity: string;
    /**
     * True when the BUYER was the market maker, i.e. the aggressor was a
     * seller. Reported as Binance reports it; naming it here keeps the
     * wire field (`m`) out of every caller.
     */
    buyerIsMaker: boolean;
}

export interface TradeStreamCallbacks {
    onTrade: (trade: TradeUpdate) => void;
    onConnectionChange?: (connected: boolean) => void;
}

export interface KlineStreamCallbacks {
    onUpdate: (update: KlineUpdate) => void;
    /** Fired whenever the upstream WebSocket transitions between open and closed. */
    onConnectionChange?: (connected: boolean) => void;
}

export interface KlineStreamHandle {
    /** Stops the stream permanently — no further reconnect attempts happen after this. */
    stop: () => void;
    getLastMessageAt: () => Date | null;
}

const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

@Injectable()
export class BinanceClient {
    private readonly logger = new Logger(BinanceClient.name);

    private readonly baseUrl =
        'https://api.binance.com';

    private readonly streamBaseUrl =
        'wss://stream.binance.com:9443/ws';

    constructor(private readonly metrics: MetricsService) {}

    async getKlines(
        symbol: string,
        interval: string,
        limit = 500,
        endTime?: number,
        startTime?: number,
    ): Promise<BinanceKline[]> {
        const endpoint = 'GET /api/v3/klines';
        const stopTimer = this.metrics.binanceRequestDurationSeconds.startTimer({ endpoint });
        try {
            const result = await this.fetchKlines(symbol, interval, limit, endTime, startTime);
            stopTimer();
            this.metrics.binanceRequestsTotal.inc({ endpoint, outcome: 'success' });
            return result;
        } catch (error) {
            stopTimer();
            this.metrics.binanceRequestsTotal.inc({ endpoint, outcome: 'failure' });
            throw error;
        }
    }

    private async fetchKlines(
        symbol: string,
        interval: string,
        limit: number,
        endTime?: number,
        startTime?: number,
    ): Promise<BinanceKline[]> {
        const url = new URL(
            '/api/v3/klines',
            this.baseUrl,
        );

        url.searchParams.set(
            'symbol',
            symbol.toUpperCase(),
        );

        url.searchParams.set(
            'interval',
            interval,
        );

        url.searchParams.set(
            'limit',
            String(limit),
        );

        // Paging cursor for backfills: fetch the `limit` candles that closed
        // at or before this timestamp (ms). Omitted, Binance returns the
        // most recent candles instead.
        if (endTime !== undefined) {
            url.searchParams.set(
                'endTime',
                String(endTime),
            );
        }

        // Lower bound of the requested window. Combined with `endTime` this
        // turns the endpoint into a true historical range query, which is
        // what the Backtest tab's result chart needs: it must show the
        // candles the run was actually configured over, not "the latest N".
        if (startTime !== undefined) {
            url.searchParams.set(
                'startTime',
                String(startTime),
            );
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new InternalServerErrorException(
                `Binance API returned ${response.status}`,
            );
        }

        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) {
            throw new InternalServerErrorException(
                'Binance API returned an invalid kline payload',
            );
        }

        return payload.map((row: unknown): BinanceKline => {
            // Binance's raw row: [openTime, open, high, low, close, volume,
            // closeTime, quoteVolume, trades, takerBaseVol, takerQuoteVol, ignore].
            if (!Array.isArray(row) || row.length < 7) {
                throw new InternalServerErrorException(
                    'Binance API returned an invalid kline row',
                );
            }
            const closeTime = Number(row[6]);
            return {
                openTime: Number(row[0]),
                open: String(row[1]),
                high: String(row[2]),
                low: String(row[3]),
                close: String(row[4]),
                volume: String(row[5]),
                closeTime,
                isClosed: isKlineClosed(closeTime),
            };
        });
    }

    /**
     * Opens a live kline (candle) stream for `symbol`/`interval` via Binance's
     * public WebSocket API. Reconnects automatically with exponential backoff
     * if the upstream connection drops; the backoff resets once a connection
     * is re-established. Every Binance-specific detail (stream URL shape,
     * `k.t/o/h/l/c/v/x` field names, raw message envelope) is handled here —
     * callers only ever see {@link KlineUpdate}.
     */
    streamCandles(
        symbol: string,
        interval: string,
        callbacks: KlineStreamCallbacks,
    ): KlineStreamHandle {
        return this.openStream(
            `${symbol.toLowerCase()}@kline_${interval}`,
            (raw) => {
                const update = this.parseKlineMessage(raw);
                if (update) callbacks.onUpdate(update);
            },
            callbacks.onConnectionChange,
        );
    }

    /**
     * Opens Binance's aggregate-trade stream for `symbol` — the tick-level
     * counterpart to {@link streamCandles}, sharing the same reconnect
     * behaviour and the same "no Binance wire format escapes this file"
     * rule.
     */
    streamTrades(
        symbol: string,
        callbacks: TradeStreamCallbacks,
    ): KlineStreamHandle {
        return this.openStream(
            `${symbol.toLowerCase()}@aggTrade`,
            (raw) => {
                const trade = this.parseTradeMessage(raw);
                if (trade) callbacks.onTrade(trade);
            },
            callbacks.onConnectionChange,
        );
    }

    /**
     * Shared reconnecting-WebSocket plumbing for every Binance stream this
     * client exposes (klines, aggregate trades). Exponential backoff resets
     * once a connection is re-established; `stop()` is permanent.
     */
    private openStream(
        streamName: string,
        onMessage: (raw: unknown) => void,
        onConnectionChange?: (connected: boolean) => void,
    ): KlineStreamHandle {
        const url = `${this.streamBaseUrl}/${streamName}`;

        let stopped = false;
        let socket: WebSocket | null = null;
        let lastMessageAt: Date | null = null;
        let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const clearReconnectTimer = () => {
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        const scheduleReconnect = () => {
            if (stopped) return;
            clearReconnectTimer();
            reconnectTimer = setTimeout(() => connect(), reconnectDelayMs);
            reconnectDelayMs = Math.min(
                reconnectDelayMs * 2,
                MAX_RECONNECT_DELAY_MS,
            );
        };

        const connect = () => {
            if (stopped) return;
            socket = new WebSocket(url);
            socket.addEventListener('open', () => {
                reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
                onConnectionChange?.(true);
            });
            socket.addEventListener('message', (event: MessageEvent) => {
                lastMessageAt = new Date();
                onMessage(event.data);
            });
            socket.addEventListener('error', () => {
                // The subsequent 'close' event drives reconnect.
            });
            socket.addEventListener('close', () => {
                onConnectionChange?.(false);
                scheduleReconnect();
            });
        };

        connect();

        return {
            stop: () => {
                stopped = true;
                clearReconnectTimer();
                socket?.close();
            },
            getLastMessageAt: () => lastMessageAt,
        };
    }

    private parseTradeMessage(raw: unknown): TradeUpdate | null {
        try {
            const payload: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
            if (!payload || typeof payload !== 'object') return null;
            const message = payload as Record<string, unknown>;
            if (message.p === undefined || message.q === undefined) return null;
            return {
                tradeId: Number(message.a),
                timestamp: Number(message.T),
                price: String(message.p),
                quantity: String(message.q),
                buyerIsMaker: Boolean(message.m),
            };
        } catch (error) {
            this.logger.warn(
                `Failed to parse Binance aggTrade message: ${String(error)}`,
            );
            return null;
        }
    }

    private parseKlineMessage(raw: unknown): KlineUpdate | null {
        try {
            const payload: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
            if (
                !payload ||
                typeof payload !== 'object' ||
                !('k' in payload)
            ) {
                return null;
            }

            const kline = (payload as { k: Record<string, unknown> }).k;
            if (!kline) {
                return null;
            }

            return {
                timestamp: Number(kline.t),
                open: String(kline.o),
                high: String(kline.h),
                low: String(kline.l),
                close: String(kline.c),
                volume: String(kline.v),
                isClosed: Boolean(kline.x),
            };
        } catch (error) {
            this.logger.warn(
                `Failed to parse Binance kline message: ${String(error)}`,
            );
            return null;
        }
    }
}
