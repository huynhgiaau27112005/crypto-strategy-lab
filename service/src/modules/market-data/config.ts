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
