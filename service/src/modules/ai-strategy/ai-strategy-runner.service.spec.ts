const runPythonWorkerMock = jest.fn();
jest.mock('./python-process.util', () => {
  const actual = jest.requireActual('./python-process.util');
  return {
    ...actual,
    runPythonWorker: (...args: unknown[]) => runPythonWorkerMock(...args),
  };
});

import { BadRequestException } from '@nestjs/common';
import { AiStrategyRunnerService } from './ai-strategy-runner.service';
import { PythonProcessError } from './python-process.util';

describe('AiStrategyRunnerService', () => {
  beforeEach(() => runPythonWorkerMock.mockReset());

  it('returns the signal array from the worker', async () => {
    runPythonWorkerMock.mockResolvedValue({ signals: ['BUY', 'HOLD', 'SELL'] });
    const service = new AiStrategyRunnerService();

    const candles = [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    await expect(service.run('def generate_signals(candles):\n    return []', candles)).resolves.toEqual([
      'BUY',
      'HOLD',
      'SELL',
    ]);
    expect(runPythonWorkerMock).toHaveBeenCalledWith(
      'run.py',
      { source: expect.any(String), candles },
      expect.any(Number),
    );
  });

  it('surfaces a worker failure as a client-facing BadRequestException, never a crash', async () => {
    runPythonWorkerMock.mockRejectedValue(new PythonProcessError('Execution timed out after 20s', 1, ''));
    const service = new AiStrategyRunnerService();

    await expect(service.run('bad source', [])).rejects.toBeInstanceOf(BadRequestException);
  });
});
