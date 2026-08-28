import { useEffect, useState } from 'react'
import { getMarketSocket } from '../lib/marketSocket'
import type { MarketTradeEvent } from '../api/types'

/**
 * Live executed trades from Binance (`aggTrade`), relayed by the `/market`
 * gateway's `trades` room.
 *
 * The "Recent ticks" panel used to be fed from the candle stream, which
 * can only ever produce one row per timeframe — so a 1m pane showed one
 * "tick" a minute and a 4h pane one every four hours. A tick is an
 * executed trade, not a bar, so this subscribes to the trade feed instead.
 *
 * `live: false` unsubscribes and keeps whatever rows are already on screen
 * (the Realtime switch), rather than clearing the table.
 */
export function useMarketTicks(limit = 12, live = true): MarketTradeEvent[] {
  const [ticks, setTicks] = useState<MarketTradeEvent[]>([])

  useEffect(() => {
    if (!live) return

    const socket = getMarketSocket()
    const handleTrade = (msg: MarketTradeEvent) => {
      setTicks((prev) => [msg, ...prev.filter((t) => t.tradeId !== msg.tradeId)].slice(0, limit))
    }

    socket.on('trade', handleTrade)
    socket.emit('subscribeTrades')

    return () => {
      socket.emit('unsubscribeTrades')
      socket.off('trade', handleTrade)
    }
  }, [limit, live])

  return ticks
}
