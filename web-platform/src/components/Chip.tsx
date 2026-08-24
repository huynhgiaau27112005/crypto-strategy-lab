/**
 * The prototype's timeframe/filter chip: a toggle button whose pressed
 * state carries all its own styling via `.chip` / `.chip-on` (mirrors the
 * prototype's `CHIP` / `CHIP_ON` inline-style constants and its
 * `data-hov="chip"` hover treatment).
 */
export default function Chip({
  label,
  pressed,
  onClick,
  disabled,
  title,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`chip${pressed ? ' chip-on' : ''}`}
      data-hov="chip"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {label}
    </button>
  )
}
