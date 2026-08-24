import type { ReactNode } from 'react'
import BlueprintCorners from './BlueprintCorners'

/**
 * The prototype's recurring "blueprint" card: hairline border, registration
 * corners, optional heading. Used for every side panel on the Realtime tab
 * (Trạng thái kết nối / Recent ticks / Chú giải) and for the not-built-yet
 * placeholder on the other five tabs.
 */
export default function Panel({
  title,
  className,
  children,
}: {
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`panel blueprint${className ? ` ${className}` : ''}`}>
      <BlueprintCorners />
      {title ? <h4 className="panel-title">{title}</h4> : null}
      {children}
    </div>
  )
}
