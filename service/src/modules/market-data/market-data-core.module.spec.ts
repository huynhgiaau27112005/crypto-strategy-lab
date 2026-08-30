import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { CacheService } from '../../cache/cache.service';
import { BinanceClient } from './clients/binance.client';
import { MarketDataCoreModule } from './market-data-core.module';
import { MarketDataService } from './market-data.service';
import { MARKET_DATA_PROVIDER } from './providers/market-data-provider';

/**
 * Wiring test for the market-data provider abstraction.
 *
 * The other specs in this module construct services with `new`, so they
 * would keep passing even if the DI binding were wrong or missing — the
 * one thing that actually makes the exchange swappable. This boots the
 * real module and asserts three things the interface is worth nothing
 * without:
 *   1. MARKET_DATA_PROVIDER resolves at all,
 *   2. MarketDataService receives THAT instance (not a second one),
 *   3. the concrete exchange class is not reachable from outside.
 */
describe('MarketDataCoreModule wiring', () => {
  async function buildModule() {
    return Test.createTestingModule({ imports: [MarketDataCoreModule] })
      .useMocker((token) => {
        if (token === DatabaseService) return { query: jest.fn() };
        if (token === CacheService) return { get: jest.fn(), set: jest.fn() };
        if (token === MetricsService) return {};
        return undefined;
      })
      .compile();
  }

  it('binds MARKET_DATA_PROVIDER to the configured exchange implementation', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(MARKET_DATA_PROVIDER)).toBeInstanceOf(BinanceClient);
    await moduleRef.close();
  });

  // useExisting, not useClass: two instances would mean two WebSocket
  // connection pools and two sets of metrics for one exchange.
  it('hands MarketDataService the same provider instance the token resolves to', async () => {
    const moduleRef = await buildModule();
    const provider = moduleRef.get(MARKET_DATA_PROVIDER);
    const service = moduleRef.get(MarketDataService);

    expect((service as unknown as { marketData: unknown }).marketData).toBe(provider);
    await moduleRef.close();
  });

  // The point of the abstraction: outside this module the exchange is
  // reachable only through the token, so nothing can quietly re-couple to
  // Binance by injecting the class.
  //
  // Asserted against the module's own `exports` metadata rather than via
  // `moduleRef.get()`: a non-strict get resolves providers from imported
  // modules whether or not they are exported, so it could not tell the
  // two cases apart.
  it('exports the token but not the concrete exchange client', () => {
    const exports = Reflect.getMetadata('exports', MarketDataCoreModule) as unknown[];
    expect(exports).toContain(MARKET_DATA_PROVIDER);
    expect(exports).not.toContain(BinanceClient);
  });
});
