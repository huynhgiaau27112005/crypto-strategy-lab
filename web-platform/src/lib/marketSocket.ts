import { io, type Socket } from 'socket.io-client'

/**
 * Singleton Socket.IO connection to the `/market` namespace.
 *
 * Socket.IO's client already multiplexes: every `io('/market')` call from
 * this tab that shares the same URL/options resolves to the *same*
 * underlying Socket object (one per namespace, cached on the shared
 * Manager). Several independent hook instances — one per realtime pane,
 * plus the workspace header's last-price reader — each call
 * `getMarketSocket()` and each `subscribe`/`unsubscribe` their own
 * interval room; they do not open one connection apiece. This mirrors the
 * backend's own "one upstream stream per interval, ref-counted by room"
 * design (see market-data.gateway.ts) instead of fighting it with N
 * independent client connections.
 *
 * Connecting through the relative path `/market` (proxied by Vite's
 * `/socket.io` rule in dev, and expected to sit behind the same reverse
 * proxy as the REST API in any real deployment) keeps this file free of a
 * hardcoded backend host, matching how api/client.ts uses `/api`.
 */
let socket: Socket | null = null

export function getMarketSocket(): Socket {
  if (!socket) {
    socket = io('/market', { transports: ['websocket', 'polling'] })
  }
  return socket
}
