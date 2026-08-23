import { PoolClient } from 'pg';
import { CandidateRepository } from './candidate.repository';

describe('CandidateRepository', () => {
  it('creates a candidate row then one candidate_strategies row per member', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: 'cand-1', iteration_id: 'it-1' }] })
      .mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;
    const repository = new CandidateRepository();

    const result = await repository.createForIteration(client, 'it-1', [
      { strategyId: 's-ma', parameters: { fastPeriod: 20, slowPeriod: 50 } },
      { strategyId: 's-rsi', parameters: { period: 14 } },
    ]);

    expect(result.id).toBe('cand-1');
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('INSERT INTO candidate_strategies');
  });
});
