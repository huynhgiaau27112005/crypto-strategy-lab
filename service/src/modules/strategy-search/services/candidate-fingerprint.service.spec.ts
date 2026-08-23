import { CandidateDefinition } from '../domain/search.types';
import { CandidateFingerprintService } from './candidate-fingerprint.service';

describe('CandidateFingerprintService', () => {
  const service = new CandidateFingerprintService();
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
        weight: 0.5,
      },
      {
        type: 'RSI',
        domain: 'MOMENTUM',
        pluginVersion: 1,
        parameters: { sellThreshold: 70, period: 14, buyThreshold: 30 },
        weight: 0.5,
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
});
