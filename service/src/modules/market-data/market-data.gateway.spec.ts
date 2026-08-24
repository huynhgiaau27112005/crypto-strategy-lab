import { KlineStreamCallbacks, KlineStreamHandle } from './clients/binance.client';
import { MarketDataGateway } from './market-data.gateway';

interface FakeSocket {
    id: string;
    join: jest.Mock;
    leave: jest.Mock;
    emit: jest.Mock;
}

function makeSocket(id: string): FakeSocket {
    return {
        id,
        join: jest.fn(),
        leave: jest.fn(),
        emit: jest.fn(),
    };
}

describe('MarketDataGateway', () => {
    let binanceClient: { streamCandles: jest.Mock };
    let candleRepository: { insertCandles: jest.Mock };
    let gateway: MarketDataGateway;
    let server: { to: jest.Mock; emit: jest.Mock };
    let capturedCallbacksByInterval: Map<string, KlineStreamCallbacks>;
    let stopByInterval: Map<string, jest.Mock>;

    beforeEach(() => {
        capturedCallbacksByInterval = new Map();
        stopByInterval = new Map();

        binanceClient = {
            streamCandles: jest.fn(
                (
                    _symbol: string,
                    interval: string,
                    callbacks: KlineStreamCallbacks,
                ): KlineStreamHandle => {
                    capturedCallbacksByInterval.set(interval, callbacks);
                    const stop = jest.fn();
                    stopByInterval.set(interval, stop);
                    return {
                        stop,
                        getLastMessageAt: () => null,
                    };
                },
            ),
        };

        candleRepository = {
            insertCandles: jest.fn().mockResolvedValue(undefined),
        };

        gateway = new MarketDataGateway(
            binanceClient as any,
            candleRepository as any,
        );

        server = {
            to: jest.fn().mockReturnThis(),
            emit: jest.fn(),
        };
        (gateway as any).server = server;
    });

    it('rejects a disallowed interval without opening an upstream stream', () => {
        const client = makeSocket('socket-1');

        gateway.handleSubscribe(client as any, { interval: '2h' });

        expect(binanceClient.streamCandles).not.toHaveBeenCalled();
        expect(client.join).not.toHaveBeenCalled();
        expect(client.emit).toHaveBeenCalledWith(
            'error',
            expect.objectContaining({ message: expect.any(String) }),
        );
    });

    it('opens exactly one upstream stream per interval, shared across subscribers', () => {
        const clientA = makeSocket('socket-a');
        const clientB = makeSocket('socket-b');

        gateway.handleSubscribe(clientA as any, { interval: '5m' });
        gateway.handleSubscribe(clientB as any, { interval: '5m' });

        expect(binanceClient.streamCandles).toHaveBeenCalledTimes(1);
        expect(binanceClient.streamCandles).toHaveBeenCalledWith(
            'BTCUSDT',
            '5m',
            expect.any(Object),
        );
        expect(clientA.join).toHaveBeenCalledWith('interval:5m');
        expect(clientB.join).toHaveBeenCalledWith('interval:5m');
    });

    it('broadcasts a closed candle only to the room for its own interval', async () => {
        const client = makeSocket('socket-1');
        gateway.handleSubscribe(client as any, { interval: '1m' });

        const callbacks = capturedCallbacksByInterval.get('1m')!;
        callbacks.onUpdate({
            timestamp: 1_700_000_000_000,
            open: '100',
            high: '110',
            low: '90',
            close: '105',
            volume: '12.5',
            isClosed: true,
        });

        // Persistence runs as a fire-and-forget promise; flush microtasks.
        await Promise.resolve();
        await Promise.resolve();

        expect(server.to).toHaveBeenCalledWith('interval:1m');
        expect(server.emit).toHaveBeenCalledWith(
            'candle',
            expect.objectContaining({
                interval: '1m',
                open: '100',
                high: '110',
                low: '90',
                close: '105',
                volume: '12.5',
            }),
        );
        expect(candleRepository.insertCandles).toHaveBeenCalledWith([
            expect.objectContaining({ timeframe: '1m' }),
        ]);
    });

    it('does not broadcast or persist an unclosed (in-progress) candle', () => {
        const client = makeSocket('socket-1');
        gateway.handleSubscribe(client as any, { interval: '1m' });

        const callbacks = capturedCallbacksByInterval.get('1m')!;
        callbacks.onUpdate({
            timestamp: 1_700_000_000_000,
            open: '100',
            high: '110',
            low: '90',
            close: '105',
            volume: '12.5',
            isClosed: false,
        });

        expect(server.emit).not.toHaveBeenCalledWith(
            'candle',
            expect.anything(),
        );
        expect(candleRepository.insertCandles).not.toHaveBeenCalled();
    });

    it('tears down the upstream stream once the last subscriber disconnects', () => {
        const clientA = makeSocket('socket-a');
        const clientB = makeSocket('socket-b');

        gateway.handleSubscribe(clientA as any, { interval: '15m' });
        gateway.handleSubscribe(clientB as any, { interval: '15m' });

        const stop = stopByInterval.get('15m')!;

        gateway.handleDisconnect(clientA as any);
        expect(stop).not.toHaveBeenCalled();

        gateway.handleDisconnect(clientB as any);
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('tears down the upstream stream on an explicit unsubscribe from the last subscriber', () => {
        const client = makeSocket('socket-1');
        gateway.handleSubscribe(client as any, { interval: '4h' });

        const stop = stopByInterval.get('4h')!;

        gateway.handleUnsubscribe(client as any, { interval: '4h' });

        expect(client.leave).toHaveBeenCalledWith('interval:4h');
        expect(stop).toHaveBeenCalledTimes(1);
    });

    it('re-opens a fresh upstream stream if a new subscriber joins after teardown', () => {
        const client = makeSocket('socket-1');
        gateway.handleSubscribe(client as any, { interval: '1h' });
        gateway.handleDisconnect(client as any);

        const other = makeSocket('socket-2');
        gateway.handleSubscribe(other as any, { interval: '1h' });

        expect(binanceClient.streamCandles).toHaveBeenCalledTimes(2);
    });

    it('retries opening the upstream stream on the next subscribe after a failed attempt (does not permanently brick the interval)', () => {
        binanceClient.streamCandles
            .mockImplementationOnce(() => {
                throw new Error('no global WebSocket in this environment');
            })
            .mockImplementationOnce(
                (
                    _symbol: string,
                    interval: string,
                    callbacks: KlineStreamCallbacks,
                ): KlineStreamHandle => {
                    capturedCallbacksByInterval.set(interval, callbacks);
                    const stop = jest.fn();
                    stopByInterval.set(interval, stop);
                    return { stop, getLastMessageAt: () => null };
                },
            );

        const clientA = makeSocket('socket-a');
        expect(() =>
            gateway.handleSubscribe(clientA as any, { interval: '5m' }),
        ).not.toThrow();

        expect(binanceClient.streamCandles).toHaveBeenCalledTimes(1);
        // The first subscriber is still recorded and gets a status snapshot,
        // even though the upstream failed to open.
        expect(clientA.emit).toHaveBeenCalledWith(
            'status',
            expect.objectContaining({ connected: false, interval: '5m' }),
        );

        const clientB = makeSocket('socket-b');
        gateway.handleSubscribe(clientB as any, { interval: '5m' });

        // A second subscribe on the same interval must retry — not skip
        // creation just because it isn't the "first" subscriber.
        expect(binanceClient.streamCandles).toHaveBeenCalledTimes(2);
        expect(capturedCallbacksByInterval.has('5m')).toBe(true);
    });

    it('does not log a warning for the ordinary disallowed-interval (BadRequestException) case', () => {
        const client = makeSocket('socket-1');
        const loggerWarnSpy = jest
            .spyOn((gateway as any).logger, 'warn')
            .mockImplementation(() => undefined);

        gateway.handleSubscribe(client as any, { interval: '2h' });

        // Only genuinely unexpected (non-BadRequestException) failures are
        // logged — the routine "unsupported interval" case is not.
        expect(loggerWarnSpy).not.toHaveBeenCalled();
        expect(client.emit).toHaveBeenCalledWith(
            'error',
            expect.objectContaining({ message: expect.stringContaining('2h') }),
        );
    });
});
