import { BinanceClient, isKlineClosed } from './binance.client';

/**
 * Minimal fake of the browser/Node `WebSocket` API, just enough to drive
 * BinanceClient.streamCandles()'s open/message/close event handling without
 * a real network connection.
 */
class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    readonly url: string;
    private readonly listeners: Record<string, Array<(event?: unknown) => void>> = {};
    closed = false;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    addEventListener(event: string, handler: (event?: unknown) => void): void {
        (this.listeners[event] ??= []).push(handler);
    }

    close(): void {
        this.closed = true;
        this.emit('close');
    }

    emit(event: string, payload?: unknown): void {
        for (const handler of this.listeners[event] ?? []) {
            handler(payload);
        }
    }
}

describe('isKlineClosed', () => {
    it('is false while the reference time is still before the close time', () => {
        expect(isKlineClosed(1_000, 500)).toBe(false);
        expect(isKlineClosed(1_000, 1_000)).toBe(false);
    });

    it('is true once the reference time has passed the close time', () => {
        expect(isKlineClosed(1_000, 1_001)).toBe(true);
    });
});

describe('BinanceClient.streamCandles', () => {
    const originalWebSocket = (global as unknown as { WebSocket?: unknown }).WebSocket;

    beforeEach(() => {
        FakeWebSocket.instances = [];
        (global as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    });

    afterEach(() => {
        (global as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
        jest.useRealTimers();
    });

    function latestSocket(): FakeWebSocket {
        return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    }

    it('parses a Binance kline message into the normalized KlineUpdate shape', () => {
        const client = new BinanceClient();
        const onUpdate = jest.fn();

        client.streamCandles('BTCUSDT', '1m', { onUpdate });

        expect(latestSocket().url).toBe(
            'wss://stream.binance.com:9443/ws/btcusdt@kline_1m',
        );

        latestSocket().emit('message', {
            data: JSON.stringify({
                e: 'kline',
                s: 'BTCUSDT',
                k: {
                    t: 1_700_000_000_000,
                    o: '65000.00',
                    h: '65200.00',
                    l: '64900.00',
                    c: '65150.00',
                    v: '12.50000000',
                    x: true,
                },
            }),
        });

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith({
            timestamp: 1_700_000_000_000,
            open: '65000.00',
            high: '65200.00',
            low: '64900.00',
            close: '65150.00',
            volume: '12.50000000',
            isClosed: true,
        });
    });

    it('does not reconnect once stop() has been called', () => {
        jest.useFakeTimers();
        const client = new BinanceClient();

        const handle = client.streamCandles('BTCUSDT', '1m', { onUpdate: jest.fn() });
        expect(FakeWebSocket.instances).toHaveLength(1);

        handle.stop();
        // stop() closes the socket, which synchronously fires our fake
        // 'close' event — the `stopped` guard must swallow it, not
        // schedule a reconnect.
        jest.advanceTimersByTime(60_000);

        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('caps the reconnect backoff at the configured ceiling instead of growing unbounded', () => {
        jest.useFakeTimers();
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        const client = new BinanceClient();

        client.streamCandles('BTCUSDT', '1m', { onUpdate: jest.fn() });
        // Never fires 'open', so the backoff never resets across cycles.
        latestSocket().emit('close');

        const observedDelays: number[] = [];
        for (let i = 0; i < 6; i++) {
            const lastCall = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1];
            const delay = lastCall[1] as number;
            observedDelays.push(delay);
            jest.advanceTimersByTime(delay);
            latestSocket().emit('close');
        }

        expect(observedDelays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);

        // One more cycle must stay at the ceiling, never exceed it.
        const finalDelay = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1];
        expect(finalDelay).toBe(30_000);
    });

    it('resets the backoff to the initial delay after a successful reconnect', () => {
        jest.useFakeTimers();
        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
        const client = new BinanceClient();

        client.streamCandles('BTCUSDT', '1m', { onUpdate: jest.fn() });
        latestSocket().emit('close'); // schedules 1_000ms reconnect, delay -> 2_000
        jest.advanceTimersByTime(1_000);
        latestSocket().emit('open'); // resets delay back to 1_000
        latestSocket().emit('close'); // should schedule 1_000ms again, not 2_000ms

        const lastDelay = setTimeoutSpy.mock.calls[setTimeoutSpy.mock.calls.length - 1][1];
        expect(lastDelay).toBe(1_000);
    });
});
