import { DEFAULT_SEARCH_CONFIG } from '../domain/search.types';
import { createSeededRandom } from '../services/seeded-random';
import { DomainGuidedRandomGenerator } from './domain-guided-random.generator';

describe('DomainGuidedRandomGenerator', () => {
  const generator = new DomainGuidedRandomGenerator();

  it('is deterministic for a given seed', () => {
    const firstRandom = createSeededRandom(42);
    const secondRandom = createSeededRandom(42);
    const first = Array.from({ length: 20 }, () =>
      generator.generate(firstRandom, DEFAULT_SEARCH_CONFIG),
    );
    const second = Array.from({ length: 20 }, () =>
      generator.generate(secondRandom, DEFAULT_SEARCH_CONFIG),
    );
    expect(first).toEqual(second);
  });

  it('always follows domain and parameter constraints', () => {
    const random = createSeededRandom(987654);
    for (let iteration = 0; iteration < 1000; iteration += 1) {
      const candidate = generator.generate(random, DEFAULT_SEARCH_CONFIG);
      expect(candidate.members.length).toBeGreaterThanOrEqual(2);
      expect(candidate.members.length).toBeLessThanOrEqual(4);
      const domains = candidate.members.map((member) => member.domain);
      expect(new Set(domains).size).toBe(domains.length);
      expect(
        domains.some((item) => item === 'TREND' || item === 'STRUCTURE'),
      ).toBe(true);
      expect(
        domains.some((item) => item === 'MOMENTUM' || item === 'VOLATILITY'),
      ).toBe(true);
      expect(
        candidate.members.reduce((sum, item) => sum + item.weight, 0),
      ).toBeCloseTo(1, 6);
      for (const item of candidate.members) {
        if (item.type === 'MA') {
          expect(item.parameters.fastPeriod).toBeLessThan(
            item.parameters.slowPeriod,
          );
        }
        if (item.type === 'RSI') {
          expect(item.parameters.buyThreshold).toBeLessThan(
            item.parameters.sellThreshold,
          );
        }
      }
    }
  });
});
