import { useEffect, useRef, useState } from 'react'

/** 30色のパレット(6列×5行)。グレー / 濃い色 / 青緑系 / 紫・茶系 / 淡い色 */
const PALETTE: string[] = [
  '#ffffff', '#e0e0e0', '#bdbdbd', '#999999', '#666666', '#333333',
  '#e53935', '#f4511e', '#fb8c00', '#ffb300', '#fdd835', '#c0ca33',
  '#43a047', '#7cb342', '#00897b', '#00acc1', '#039be5', '#1e88e5',
  '#3949ab', '#5e35b1', '#8e24aa', '#d81b60', '#6d4c41', '#546e7a',
  '#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b3e5fc', '#e1bee7',
]

interface Props {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
  label: string
}

export default function ColorPicker({ value, onChange, disabled, label }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  // 外側クリック・Esc で閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="rc-color">
      <button
        type="button"
        className="rc-color-btn"
        style={{ background: value }}
        disabled={disabled}
        aria-label={`${label}: ${value}`}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen(v => !v)}
      />
      {open && (
        <span className="rc-color-pop" role="listbox" aria-label={`${label}を選択`}>
          {PALETTE.map(c => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c.toLowerCase() === value.toLowerCase()}
              className={`rc-swatch${c.toLowerCase() === value.toLowerCase() ? ' rc-swatch-on' : ''}`}
              style={{ background: c }}
              title={c}
              onClick={() => {
                onChange(c)
                setOpen(false)
              }}
            />
          ))}
        </span>
      )}
    </span>
  )
}
