import { BadRequestException, Injectable } from '@nestjs/common';
import { getRunTimeoutMs } from './ai-strategy.config';
import { runPythonWorker, PythonProcessError } from './python-process.util';
import { CandleInput, Signal } from './ai-strategy.types';

interface RunWorkerOutput {
  signals: Signal[];
}

/**
 * Runs workers/ai-strategy/run.py over a real candle series for one saved
 * strategy. One subprocess call for the WHOLE series — never one call per
 * candle, since a backtest evaluates thousands of candles and per-candle
 * spawning would make this unusably slow.
 *
 * NOT a security sandbox — see ai-strategy-validator.service.ts's docstring
 * and artifacts/ai-strategy.md. run.py re-checks contract/safety itself
 * before executing (defense in depth), but this is still a bounded
 * execution gate, not isolation.
 */
@Injectable()
export class AiStrategyRunnerService {
  async run(source: string, candles: CandleInput[]): Promise<Signal[]> {
    try {
      const result = await runPythonWorker<RunWorkerOutput>(
        'run.py',
        { source, candles },
        getRunTimeoutMs(),
      );
      return result.signals;
    } catch (err) {
      const message = err instanceof PythonProcessError ? err.message : String(err);
      // A saved-but-broken strategy (or a hung one) is a client-visible
      // error, not a 500 — the strategy source is user data, not our bug.
      throw new BadRequestException(`Strategy execution failed: ${message}`);
    }
  }
}
