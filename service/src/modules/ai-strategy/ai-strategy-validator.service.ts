import { Injectable, Logger } from '@nestjs/common';
import { getValidateTimeoutMs } from './ai-strategy.config';
import { runPythonWorker, PythonProcessError } from './python-process.util';
import { ValidationResult } from './ai-strategy.types';

/**
 * Runs workers/ai-strategy/validate.py over one candidate strategy source
 * and returns its four-check result verbatim — this IS what the UI's
 * "Kiểm tra & validation" panel renders, not a re-derived summary.
 *
 * This is a validation gate, not a security sandbox: it rejects code that
 * fails an AST-based static scan or a bounded smoke run, but executing
 * model-generated Python at all — even restricted, even timeboxed — does
 * not contain a sufficiently determined attacker. See
 * workers/ai-strategy/sandbox.py and artifacts/ai-strategy.md.
 */
@Injectable()
export class AiStrategyValidatorService {
  private readonly logger = new Logger(AiStrategyValidatorService.name);

  async validate(source: string): Promise<ValidationResult> {
    try {
      return await runPythonWorker<ValidationResult>('validate.py', { source }, getValidateTimeoutMs());
    } catch (err) {
      // The validator process itself failing to run (bad interpreter path,
      // crashed before printing JSON, etc) is different from the generated
      // code being invalid — surface it as a single failed "parses" check
      // rather than a 500, since the caller always expects a
      // ValidationResult shape back.
      const message = err instanceof PythonProcessError ? err.message : String(err);
      this.logger.error(`Validation worker failed to run: ${message}`);
      return {
        valid: false,
        checks: [
          {
            key: 'parses',
            passed: false,
            message: `Validation worker could not run: ${message}`,
          },
        ],
      };
    }
  }
}
