import { BaseStrategy } from "../core/base-strategy.js";
import { Injectable } from "@nestjs/common";

@Injectable()
export class RSIStrategy extends BaseStrategy {
  execute(): void {
    console.log('Execute RSI Strategy');
  }
}
