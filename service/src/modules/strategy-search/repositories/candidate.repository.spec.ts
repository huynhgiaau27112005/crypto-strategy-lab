import { PoolClient } from 'pg';
import { DatabaseService } from '../../../database/database.service';
import { CandidateRepository } from './candidate.repository';

describe('CandidateRepository', () => {
  const CANDIDATE_ID = 'cand-1';
  const USER_ID = 'user-1';

  describe('createForIteration', () => {
    it('creates a candidate row then one candidate_strategies row per member', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'cand-1', iteration_id: 'it-1' }] })
        .mockResolvedValue({ rows: [] });
      const client = { query } as unknown as PoolClient;
      const database = { query: jest.fn() } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const result = await repository.createForIteration(client, 'it-1', [
        { strategyId: 's-ma', parameters: { fastPeriod: 20, slowPeriod: 50 } },
        { strategyId: 's-rsi', parameters: { period: 14 } },
      ]);

      expect(result.id).toBe('cand-1');
      expect(query).toHaveBeenCalledTimes(3);
      expect(query.mock.calls[1][0]).toContain('INSERT INTO candidate_strategies');
    });
  });

  describe('findDetail', () => {
    const headerRow = {
      candidate_id: CANDIDATE_ID,
      experiment_id: 'exp-1',
      iteration_number: 3,
      evaluation_id: 'eval-1',
      total_return: '18.240000',
      profit_loss: '1824.000000',
      win_rate: '0.610000',
      max_drawdown: '-6.100000',
      number_of_trades: 2,
      profit_factor: '1.940000',
      sharpe_ratio: '1.120000',
      overall_score: '81.400000',
    };
    const memberRows = [
      {
        strategy_id: 's-ma',
        name: 'MA',
        strategy_type: 'SYSTEM',
        version: 1,
        parameters: { fastPeriod: 20, slowPeriod: 50 },
        weight: '0.500000',
      },
      {
        strategy_id: 's-rsi',
        name: 'RSI',
        strategy_type: 'SYSTEM',
        version: 3,
        parameters: { period: 14 },
        weight: '0.500000',
      },
    ];
    const tradeRows = [
      {
        id: 'trade-1',
        side: 'LONG',
        entry_time: new Date('2026-01-01T00:00:00Z'),
        entry_price: '100.000000000000',
        quantity: '1.000000000000',
        stop_loss: null,
        take_profit: null,
        exit_time: new Date('2026-01-02T00:00:00Z'),
        exit_price: '110.000000000000',
        profit_loss: '10.000000000000',
        return_pct: '8.000000',
        exit_reason: 'SIGNAL',
      },
    ];

    function makeQueryMock() {
      return jest
        .fn()
        .mockResolvedValueOnce({ rows: [headerRow] }) // header
        .mockResolvedValueOnce({ rows: memberRows }) // members
        .mockResolvedValueOnce({ rows: tradeRows }) // trades page
        .mockResolvedValueOnce({ rows: [{ count: 27 }] }); // count
    }

    it('scopes the header query WHERE clause to both c.id and the owning e.user_id', async () => {
      const query = makeQueryMock();
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      const [headerSql, headerParams] = query.mock.calls[0];
      expect(headerSql).toMatch(/WHERE\s+c\.id\s*=\s*\$1\s+AND\s+e\.user_id\s*=\s*\$2/);
      expect(headerSql).toContain('JOIN experiment_iterations ei ON ei.id = c.iteration_id');
      expect(headerSql).toContain('JOIN experiments e ON e.id = ei.experiment_id');
      expect(headerParams).toEqual([CANDIDATE_ID, USER_ID]);
    });

    it('returns null, issuing only the header query, when no row matches (no candidate, or not owned by this user)', async () => {
      const query = jest.fn().mockResolvedValueOnce({ rows: [] });
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const result = await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      expect(result).toBeNull();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('reads member weight from experiment_config_strategies joined via experiment_configs, not from the candidate', async () => {
      const query = makeQueryMock();
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      const [membersSql, membersParams] = query.mock.calls[1];
      expect(membersSql).toContain('candidate_strategies');
      expect(membersSql).toContain('experiment_config_strategies');
      expect(membersSql).toContain('experiment_configs');
      expect(membersParams).toEqual([CANDIDATE_ID]);
    });

    // Regression guard for the save-a-version cascade: a regenerated
    // candidate points at a NEWER strategies row than the one pinned into
    // experiment_config_strategies at start(). Resolving weight by
    // strategy_id would INNER-JOIN those members away entirely; resolving
    // by name lets the new version inherit its strategy's configured
    // weight. If someone "simplifies" this back to an id join, the
    // regenerated combos silently lose members from every detail view.
    it('resolves member weight by strategy NAME, so a newer version row still inherits its configured weight', async () => {
      const query = makeQueryMock();
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      const [membersSql] = query.mock.calls[1];
      expect(membersSql).toMatch(/cfg_s\.name\s*=\s*s\.name/);
      expect(membersSql).not.toMatch(/ecs\.strategy_id\s*=\s*cs\.strategy_id/);
    });

    it('selects each member\'s own pinned s.version, not the catalog\'s current version', async () => {
      const query = makeQueryMock();
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const detail = await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      expect(query.mock.calls[1][0]).toContain('s.version');
      // Fixture pins MA at v1 and RSI at v3 — both must survive verbatim.
      expect(detail?.members.map((m) => m.version)).toEqual([1, 3]);
    });

    it('pages trades by LIMIT pageSize OFFSET (page-1)*pageSize, ordered by entry_time ASC, and counts the total separately', async () => {
      const query = makeQueryMock();
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const detail = await repository.findDetail(CANDIDATE_ID, USER_ID, 3, 10);

      const [tradesSql, tradesParams] = query.mock.calls[2];
      expect(tradesSql).toContain('ORDER BY t.entry_time ASC');
      expect(tradesSql).toContain('LIMIT $2 OFFSET $3');
      expect(tradesParams).toEqual([CANDIDATE_ID, 10, 20]); // offset = (3-1)*10

      const [countSql, countParams] = query.mock.calls[3];
      expect(countSql).toContain('COUNT(*)');
      expect(countParams).toEqual([CANDIDATE_ID]);

      expect(detail?.tradeTotal).toBe(27);
      expect(detail?.trades).toHaveLength(1);
    });

    it('assembles the full CandidateDetail shape with numeric coercion applied', async () => {
      const query = makeQueryMock();
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const detail = await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      expect(detail).toEqual({
        candidateId: CANDIDATE_ID,
        experimentId: 'exp-1',
        iterationNumber: 3,
        members: [
          { type: 'MA', version: 1, parameters: { fastPeriod: 20, slowPeriod: 50 }, weight: 0.5 },
          { type: 'RSI', version: 3, parameters: { period: 14 }, weight: 0.5 },
        ],
        evaluation: {
          totalReturn: 18.24,
          profitLoss: 1824,
          winRate: 0.61,
          maxDrawdown: -6.1,
          numberOfTrades: 2,
          profitFactor: 1.94,
          sharpeRatio: 1.12,
          overallScore: 81.4,
        },
        trades: [
          {
            id: 'trade-1',
            side: 'LONG',
            entryTime: tradeRows[0].entry_time,
            entryPrice: 100,
            quantity: 1,
            stopLoss: null,
            takeProfit: null,
            exitTime: tradeRows[0].exit_time,
            exitPrice: 110,
            profitLoss: 10,
            returnPct: 8,
            exitReason: 'SIGNAL',
          },
        ],
        tradeTotal: 27,
      });
    });

    it('resolves an AI_GENERATED member row to type "AI:<strategyId>", not its human name', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [headerRow] })
        .mockResolvedValueOnce({
          rows: [
            {
              strategy_id: 'ai-1',
              name: 'MyMomentumBot',
              strategy_type: 'AI_GENERATED',
              version: 2,
              parameters: {},
              weight: '0.500000',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const detail = await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      expect(detail?.members).toEqual([{ type: 'AI:ai-1', version: 2, parameters: {}, weight: 0.5 }]);
    });

    it('returns evaluation: null when the candidate has no evaluation row yet', async () => {
      const pendingHeaderRow = {
        ...headerRow,
        evaluation_id: null,
        total_return: null,
        profit_loss: null,
        win_rate: null,
        max_drawdown: null,
        number_of_trades: null,
        profit_factor: null,
        sharpe_ratio: null,
        overall_score: null,
      };
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [pendingHeaderRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });
      const database = { query } as unknown as DatabaseService;
      const repository = new CandidateRepository(database);

      const detail = await repository.findDetail(CANDIDATE_ID, USER_ID, 1, 20);

      expect(detail?.evaluation).toBeNull();
    });
  });
});
