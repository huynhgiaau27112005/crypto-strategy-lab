export type SignalKind = 'up' | 'down' | 'neutral'

/**
 * The prototype's small outlined tag used for BUY/SELL/HOLD (and LONG/
 * SHORT) signal labels — border + text tinted by direction, no fill
 * (mirrors the prototype's `BADGE + UP/DOWN` inline-style construction).
 */
export default function SignalBadge({ label, kind }: { label: string; kind: SignalKind }) {
  return <span className={`badge badge-${kind}`}>{label}</span>
}
