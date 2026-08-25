import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiStrategyService } from './ai-strategy.service';

function makeService(overrides: {
  llmProvider?: any;
  validator?: any;
  runner?: any;
  repository?: any;
  candles?: any;
} = {}) {
  const llmProvider = overrides.llmProvider ?? {
    generateStrategy: jest.fn().mockResolvedValue({ code: 'def generate_signals(candles):\n    return []', raw: '```python\n...\n```', providerName: 'fake' }),
  };
  const validator = overrides.validator ?? {
    validate: jest.fn().mockResolvedValue({ valid: true, checks: [] }),
  };
  const runner = overrides.runner ?? {
    run: jest.fn().mockResolvedValue(['BUY', 'HOLD']),
  };
  const repository = overrides.repository ?? {
    listMine: jest.fn().mockResolvedValue([]),
    findMineById: jest.fn().mockResolvedValue(null),
    createVersion: jest.fn(),
  };
  const candles = overrides.candles ?? {
    findCandles: jest.fn().mockResolvedValue([]),
  };
  const service = new AiStrategyService(llmProvider, validator, runner, repository, candles);
  return { service, llmProvider, validator, runner, repository, candles };
}

describe('AiStrategyService', () => {
  describe('generate', () => {
    it('validates the generated code and returns both the code and the validation result', async () => {
      const { service, validator } = makeService();
      const result = await service.generate('MA cross');
      expect(result.code).toContain('generate_signals');
      expect(result.validation).toEqual({ valid: true, checks: [] });
      expect(validator.validate).toHaveBeenCalledWith(result.code);
    });

    it('turns a provider failure (e.g. missing API key) into a clear BadRequestException, not a crash', async () => {
      const llmProvider = { generateStrategy: jest.fn().mockRejectedValue(new Error('OPENAI_API_KEY is not configured')) };
      const { service } = makeService({ llmProvider });
      await expect(service.generate('anything')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('save', () => {
    it('re-validates before saving and rejects invalid code without writing anything', async () => {
      const validator = { validate: jest.fn().mockResolvedValue({ valid: false, checks: [{ key: 'safety', passed: false, message: 'disallowed import: os' }] }) };
      const repository = { createVersion: jest.fn() };
      const { service } = makeService({ validator, repository });

      await expect(service.save('user-1', 'MY_STRAT', 'import os')).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createVersion).not.toHaveBeenCalled();
    });

    it('saves valid code as a new version row', async () => {
      const repository = {
        createVersion: jest.fn().mockResolvedValue({
          id: 'row-1',
          name: 'MY_STRAT',
          version: 1,
          created_at: new Date('2026-01-01'),
          is_active: true,
          source_code: 'def generate_signals(candles):\n    return []',
        }),
      };
      const { service } = makeService({ repository });

      const result = await service.save('user-1', 'MY_STRAT', 'def generate_signals(candles):\n    return []');
      expect(result.id).toBe('row-1');
      expect(repository.createVersion).toHaveBeenCalledWith('user-1', 'MY_STRAT', 'def generate_signals(candles):\n    return []');
    });
  });

  describe('getOne / run — ownership scoping', () => {
    it('getOne throws NotFoundException when the row is not owned by the caller (repository returned null)', async () => {
      const repository = { findMineById: jest.fn().mockResolvedValue(null) };
      const { service } = makeService({ repository });

      await expect(service.getOne('strat-1', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
      // Regression guard: getOne must delegate ownership scoping to the
      // repository call (id AND userId), not fetch broadly and filter here.
      expect(repository.findMineById).toHaveBeenCalledWith('strat-1', 'user-1');
    });

    it('run throws NotFoundException for a strategy owned by a different user, and never calls the runner', async () => {
      const repository = { findMineById: jest.fn().mockResolvedValue(null) };
      const runner = { run: jest.fn() };
      const { service } = makeService({ repository, runner });

      await expect(service.run('strat-1', 'user-1', '1h', 200)).rejects.toBeInstanceOf(NotFoundException);
      expect(runner.run).not.toHaveBeenCalled();
    });

    it('run executes the strategy over explicitly supplied candles and returns signals + count', async () => {
      const repository = {
        findMineById: jest.fn().mockResolvedValue({ id: 'strat-1', source_code: 'def generate_signals(candles):\n    return []' }),
      };
      const runner = { run: jest.fn().mockResolvedValue(['BUY', 'SELL']) };
      const { service } = makeService({ repository, runner });

      const candles = [
        { timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 },
        { timestamp: 2, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ];
      const result = await service.run('strat-1', 'user-1', '1h', 200, candles);
      expect(result).toEqual({ candleCount: 2, signals: ['BUY', 'SELL'] });
      expect(runner.run).toHaveBeenCalledWith('def generate_signals(candles):\n    return []', candles);
    });

    it('run loads real candles (oldest-first) from the repository when none are supplied explicitly', async () => {
      const repository = {
        findMineById: jest.fn().mockResolvedValue({ id: 'strat-1', source_code: 'src' }),
      };
      const runner = { run: jest.fn().mockResolvedValue(['HOLD', 'HOLD']) };
      const candleRepo = {
        findCandles: jest.fn().mockResolvedValue([
          { timeframe: '1h', timestamp: new Date('2026-01-01T02:00:00Z'), open: '2', high: '2', low: '2', close: '2', volume: '2' },
          { timeframe: '1h', timestamp: new Date('2026-01-01T01:00:00Z'), open: '1', high: '1', low: '1', close: '1', volume: '1' },
        ]),
      };
      const { service } = makeService({ repository, runner, candles: candleRepo });

      await service.run('strat-1', 'user-1', '1h', 200);
      // findCandles returns DESC (newest first); the service must reverse
      // it to oldest-first before handing it to the strategy.
      const passedCandles = runner.run.mock.calls[0][1];
      expect(passedCandles[0].close).toBe(1);
      expect(passedCandles[1].close).toBe(2);
    });

    it('rejects with BadRequestException when no candles are available for the requested timeframe', async () => {
      const repository = {
        findMineById: jest.fn().mockResolvedValue({ id: 'strat-1', source_code: 'src' }),
      };
      const candleRepo = { findCandles: jest.fn().mockResolvedValue([]) };
      const { service } = makeService({ repository, candles: candleRepo });

      await expect(service.run('strat-1', 'user-1', '1h', 200)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listMine', () => {
    it('delegates straight to the repository (ownership scoping lives there)', async () => {
      const repository = { listMine: jest.fn().mockResolvedValue([]) };
      const { service } = makeService({ repository });
      await service.listMine('user-1');
      expect(repository.listMine).toHaveBeenCalledWith('user-1');
    });
  });
});
