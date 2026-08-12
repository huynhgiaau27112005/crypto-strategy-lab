import { BaseStrategy } from '../core/base-strategy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MAStrategy extends BaseStrategy {
  execute(): void {
    console.log('Execute MA Strategy');
  }
}
