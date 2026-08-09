import { useParams } from 'react-router-dom'

export default function StrategyDetailPage() {
  const { id } = useParams()

  return (
    <main>
      <h1>Strategy Detail</h1>
      <p>
        Detail view for strategy <code>{id ?? 'unknown'}</code> — signals, trades, and metrics.
      </p>
    </main>
  )
}
