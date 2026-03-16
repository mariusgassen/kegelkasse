import {type ReactNode, useEffect, useRef, useState} from 'react'

interface SheetProps {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
    onSubmit?: () => void
}

export function Sheet({open, onClose, title, children, onSubmit}: SheetProps) {
    const [dragY, setDragY] = useState(0)
    const startYRef = useRef(0)
    const isDraggingRef = useRef(false)
    const dragYRef = useRef(0)
    const handleRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open, onClose])

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [open])

    useEffect(() => {
        if (!open) {
            setDragY(0)
            dragYRef.current = 0
        }
    }, [open])

    // Attach touch listeners with { passive: false } so we can preventDefault on iOS Safari.
    // React's synthetic onTouchMove is passive and cannot prevent scroll.
    useEffect(() => {
        const el = handleRef.current
        if (!el) return

        const onStart = (e: TouchEvent) => {
            startYRef.current = e.touches[0].clientY
            isDraggingRef.current = true
        }
        const onMove = (e: TouchEvent) => {
            if (!isDraggingRef.current) return
            e.preventDefault()
            const delta = e.touches[0].clientY - startYRef.current
            if (delta > 0) {
                dragYRef.current = delta
                setDragY(delta)
            }
        }
        const onEnd = () => {
            isDraggingRef.current = false
            if (dragYRef.current > 80) {
                onClose()
            } else {
                dragYRef.current = 0
                setDragY(0)
            }
        }

        el.addEventListener('touchstart', onStart, {passive: true})
        el.addEventListener('touchmove', onMove, {passive: false})
        el.addEventListener('touchend', onEnd, {passive: true})
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchmove', onMove)
            el.removeEventListener('touchend', onEnd)
        }
    }, [open, onClose])

    if (!open) return null

    const inner = onSubmit ? (
        <form onSubmit={e => {
            e.preventDefault();
            onSubmit()
        }}>
            {children}
        </form>
    ) : children

    return (
        <div className="bottom-sheet" onClick={e => {
            if (e.target === e.currentTarget) onClose()
        }}>
            <div
                className="sheet-panel safe-bottom"
                style={{
                    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                    transition: dragY > 0 ? 'none' : 'transform 0.2s ease',
                }}
            >
                {/* Drag handle */}
                <div
                    ref={handleRef}
                    className="sheet-handle"
                />
                {/* Title row with close button */}
                <div className="flex items-center justify-between mb-4">
                    <div className="sheet-title mb-0">{title}</div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-kce-muted active:opacity-60 flex-shrink-0"
                        style={{background: 'rgba(255,255,255,0.07)', fontSize: 16, lineHeight: 1}}
                    >
                        ✕
                    </button>
                </div>
                {inner}
            </div>
        </div>
    )
}
