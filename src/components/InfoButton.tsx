import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface InfoButtonProps {
  content: string
  title?: string
  position?: 'right' | 'left' | 'bottom' | 'top'
}

/**
 * ℹ️ InfoButton — renders tooltip via React portal (appended to document.body)
 * so it is NEVER clipped by parent overflow:hidden or stacking contexts.
 */
export default function InfoButton({ content, title, position = 'right' }: InfoButtonProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const calcPosition = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const POPUP_W = 230
    const POPUP_H = 160 // approximate; will auto-size

    let top = 0
    let left = 0

    switch (position) {
      case 'right':
        top  = r.top + r.height / 2
        left = r.right + 10
        break
      case 'left':
        top  = r.top + r.height / 2
        left = r.left - POPUP_W - 10
        break
      case 'bottom':
        top  = r.bottom + 8
        left = r.left + r.width / 2 - POPUP_W / 2
        break
      case 'top':
        top  = r.top - POPUP_H - 8
        left = r.left + r.width / 2 - POPUP_W / 2
        break
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - POPUP_W - 8))
    top  = Math.max(8, Math.min(top, window.innerHeight - 60))

    setCoords({ top, left })
  }, [position])

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    calcPosition()
    setOpen(o => !o)
  }

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [open])

  const popup = open && coords ? createPortal(
    <div
      className="info-popup"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        transform: position === 'right' || position === 'left' ? 'translateY(-50%)' : 'none',
        zIndex: 99999,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {title && <div className="info-popup__title">{title}</div>}
      <div className="info-popup__body">{content}</div>
      <button
        className="info-popup__close"
        onMouseDown={e => { e.stopPropagation(); setOpen(false) }}
      >
        ✕
      </button>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        className="info-btn"
        onMouseDown={e => e.stopPropagation()}
        onClick={handleOpen}
        title="Click for information"
        aria-label="More information"
      >
        ℹ
      </button>
      {popup}
    </>
  )
}
