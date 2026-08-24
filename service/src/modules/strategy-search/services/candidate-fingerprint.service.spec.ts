import { CandidateDefinition, CandidateMember } from '../domain/search.types';
import { CandidateFingerprintService } from './candidate-fingerprint.service';
import { StrategyRegistry } from '../../strategy-plugin/strategy-registry';
import { StrategyPlugin } from '../../strategy-plugin/strategy-plugin.types';

describe('CandidateFingerprintService', () => {
  const registry = new StrategyRegistry();
  registry.register({
    type: 'MA',
    domain: 'TREND',
    displayName: 'Moving Average Crossover',
    description: 'desc',
    parameterSchema: [
      { key: 'fastPeriod', label: 'Fast period', type: 'int', min: 10, max: 50, step: 1, default: 10 },
      { key: 'slowPeriod', label: 'Slow period', type: 'int', min: 30, max: 200, step: 1, default: 30 },
    ],
    analyze: () => 'HOLD',
  } as StrategyPlugin);
  const service = new CandidateFingerprintService(registry);
  const candidate: CandidateDefinition = {
    schemaVersion: 1,
    combination: {
      method: 'WEIGHTED_VOTE',
      buyThreshold: 0.3,
      sellThreshold: -0.3,
    },
    members: [
      {
        type: 'MA',
        domain: 'TREND',
        pluginVersion: 1,
        parameters: { slowPeriod: 50, fastPeriod: 20 },
      },
      {
        type: 'RSI',
        domain: 'MOMENTUM',
        pluginVersion: 1,
        parameters: { sellThreshold: 70, period: 14, buyThreshold: 30 },
      },
    ],
  };

  it('creates an order-independent canonical fingerprint', () => {
    const reversed: CandidateDefinition = {
      ...candidate,
      members: [...candidate.members].reverse().map((member) => ({
        ...member,
        parameters: Object.fromEntries(
          Object.entries(member.parameters).reverse(),
        ),
      })),
    };
    expect(service.fingerprint(candidate)).toBe(service.fingerprint(reversed));
  });

  it('includes parameter values in the fingerprint', () => {
    const changed: CandidateDefinition = JSON.parse(
      JSON.stringify(candidate),
    ) as CandidateDefinition;
    changed.members[0].parameters.fastPeriod = 10;
    expect(service.fingerprint(candidate)).not.toBe(
      service.fingerprint(changed),
    );
  });

  it('produces distinct display names for same-type candidates with different parameters', () => {
    const maMember: CandidateMember = {
      type: 'MA',
      domain: 'TREND',
      pluginVersion: 1,
      parameters: { fastPeriod: 20, slowPeriod: 50 },
    };
    const other: CandidateDefinition = {
      schemaVersion: 1,
      combination: candidate.combination,
      members: [maMember],
    };
    const differentParams: CandidateDefinition = {
      ...other,
      members: [{ ...maMember, parameters: { fastPeriod: 10, slowPeriod: 30 } }],
    };

    const nameA = service.displayName(other);
    const nameB = service.displayName(differentParams);

    expect(nameA).not.toBe(nameB);
    expect(nameA).toContain('20');
    expect(nameA).toContain('50');
    expect(nameB).toContain('10');
    expect(nameB).toContain('30');
  });

  it('falls back to the raw type string instead of throwing for an unregistered plugin type', () => {
    // BOLLINGER is a valid SearchStrategyType but was never registered on this
    // spec's local registry, standing in for a candidate row whose plugin
    // is absent, renamed, or not yet registered in a partially-booted context.
    const unregistered: CandidateDefinition = {
      schemaVersion: 1,
      combination: candidate.combination,
      members: [
        {
          type: 'BOLLINGER',
          domain: 'VOLATILITY',
          pluginVersion: 1,
          parameters: { period: 20 },
        },
      ],
    };

    expect(() => service.displayName(unregistered)).not.toThrow();
    expect(service.displayName(unregistered)).toContain('BOLLINGER');
  });

  it('holds the position of a missing parameter with a placeholder instead of shifting the remaining values', () => {
    const partial: CandidateDefinition = {
      schemaVersion: 1,
      combination: candidate.combination,
      members: [
        {
          type: 'MA',
          domain: 'TREND',
          pluginVersion: 1,
          // fastPeriod deliberately missing — must not cause slowPeriod's 50
          // to be displayed as if it were the fast period.
          parameters: { slowPeriod: 50 },
        },
      ],
    };

    const name = service.displayName(partial);

    expect(name).toBe('Moving Average Crossover (?/50)');
  });
});
