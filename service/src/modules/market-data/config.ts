import { BadRequestException } from '@nestjs/common';
import { Spot } from '@binance/spot';

/**
 * Creates a client without making network calls during module import.
 * Public market-data requests work without credentials; authenticated
 * endpoints use the optional API key and secret supplied at runtime.
 */
export function createSpotClient(): Spot {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  return apiKey && apiSecret
    ? new Spot({ configurationRestAPI: { apiKey, apiSecret } })
    : new Spot({});
}

// Must match the app_timeframe enum in database/migrations/003_candidate_auth_schema.sql.
// Single source of truth: both MarketDataService (REST) and MarketDataGateway
// (WebSocket) import this instead of keeping their own copies.
export const ALLOWED_INTERVALS = ['1m', '5m', '15m', '1h', '4h'] as const;
export type AllowedInterval = (typeof ALLOWED_INTERVALS)[number];

export function assertAllowedInterval(
  interval: string,
): asserts interval is AllowedInterval {
  if (!ALLOWED_INTERVALS.includes(interval as AllowedInterval)) {
    throw new BadRequestException(
      `Unsupported interval "${interval}". Allowed values: ${ALLOWED_INTERVALS.join(', ')}.`,
    );
  }
}
