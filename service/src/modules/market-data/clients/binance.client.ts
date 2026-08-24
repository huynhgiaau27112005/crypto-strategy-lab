import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';

export type BinanceKline = [
    openTime: number,
    open: string,
    high: string,
    low: string,
    close: string,
    volume: string,
];

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

    async getKlines(
        symbol: string,
        interval: string,
        limit = 500,
        endTime?: number,
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

        return payload.map((row: unknown) => {
            if (!Array.isArray(row) || row.length < 6) {
                throw new InternalServerErrorException(
                    'Binance API returned an invalid kline row',
                );
            }
            return [
                Number(row[0]),
                String(row[1]),
                String(row[2]),
                String(row[3]),
                String(row[4]),
                String(row[5]),
            ];
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
        const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
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
            if (stopped) {
                return;
            }
            clearReconnectTimer();
            reconnectTimer = setTimeout(() => {
                connect();
            }, reconnectDelayMs);
            reconnectDelayMs = Math.min(
                reconnectDelayMs * 2,
                MAX_RECONNECT_DELAY_MS,
            );
        };

        const connect = () => {
            if (stopped) {
                return;
            }

            socket = new WebSocket(url);

            socket.addEventListener('open', () => {
                reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
                callbacks.onConnectionChange?.(true);
            });

            socket.addEventListener('message', (event: MessageEvent) => {
                lastMessageAt = new Date();
                const update = this.parseKlineMessage(event.data);
                if (update) {
                    callbacks.onUpdate(update);
                }
            });

            socket.addEventListener('error', () => {
                // The subsequent 'close' event drives reconnect; this only
                // silences unhandled-error noise from the WebSocket.
            });

            socket.addEventListener('close', () => {
                callbacks.onConnectionChange?.(false);
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
