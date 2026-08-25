const runPythonWorkerMock = jest.fn();
jest.mock('./python-process.util', () => {
  const actual = jest.requireActual('./python-process.util');
  return {
    ...actual,
    runPythonWorker: (...args: unknown[]) => runPythonWorkerMock(...args),
  };
});

import { AiStrategyValidatorService } from './ai-strategy-validator.service';
import { PythonProcessError } from './python-process.util';

describe('AiStrategyValidatorService', () => {
  beforeEach(() => runPythonWorkerMock.mockReset());

  it('passes through the worker result as-is', async () => {
    const result = { valid: true, checks: [{ key: 'parses', passed: true, message: 'ok' }] };
    runPythonWorkerMock.mockResolvedValue(result);

    const service = new AiStrategyValidatorService();
    await expect(service.validate('def generate_signals(candles):\n    return []')).resolves.toEqual(result);
    expect(runPythonWorkerMock).toHaveBeenCalledWith('validate.py', { source: expect.any(String) }, expect.any(Number));
  });

  it('turns a worker-process failure into a failed validation result instead of throwing', async () => {
    runPythonWorkerMock.mockRejectedValue(new PythonProcessError('interpreter not found', null, ''));

    const service = new AiStrategyValidatorService();
    const result = await service.validate('def generate_signals(candles):\n    return []');

    expect(result.valid).toBe(false);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].message).toContain('interpreter not found');
  });
});
