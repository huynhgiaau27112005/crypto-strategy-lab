import { BaseStrategy } from '../core/base-strategy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SMAStrategy extends BaseStrategy {
  execute(): void {
    console.log('Execute MA Strategy');
  }
}
