import { BaseStrategy } from '../core/base-strategy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BollingerStrategy extends BaseStrategy {
  execute(): void {
    console.log('Execute Bollinger Strategy');
  }
}
