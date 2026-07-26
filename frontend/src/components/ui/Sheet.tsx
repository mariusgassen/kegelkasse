import {type ReactNode, useEffect, useRef, useState} from 'react'
import {useT} from '@/i18n'
import {MORPH_NAME} from '@/lib/viewTransition'
import {DURATION, EASING} from '@/lib/motion'

interface SheetProps {
    open: boolean
    onClose: () => void
    /** Shown as the sheet heading, and always used as the dialog's accessible name. */
    title: string
    /** Replaces the heading text (e.g. with a tab bar). The close button stays. */
    header?: ReactNode
    children: ReactNode
    onSubmit?: () => void
    /** Extra content rendered outside the panel, e.g. nested overlays. */
    overlays?: ReactNode
    /**
     * Make this sheet the *destination* of a shared-element view transition (#72), so the card that
     * opened it appears to grow into it. Only set this when the opener wrapped its state update in
     * `morphFrom(originElement, …)` — the effect needs both halves of the pair to carry the name.
     */
    morph?: boolean
}

export function Sheet({open, onClose, title, header, children, onSubmit, overlays, morph}: SheetProps) {
    const t = useT()
    const [dragY, setDragY] = useState(0)
    const startYRef = useRef(0)
    const isDraggingRef = useRef(false)
    const dragYRef = useRef(0)
    const handleRef = useRef<HTMLDivElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const previouslyFocusedRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open, onClose])

    // Move focus into the sheet on open, restore it to the trigger element on close
    useEffect(() => {
        if (open) {
            previouslyFocusedRef.current = document.activeElement as HTMLElement | null
            panelRef.current?.focus()
        } else {
            previouslyFocusedRef.current?.focus()
            previouslyFocusedRef.current = null
        }
    }, [open])

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
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className="sheet-panel safe-bottom"
                style={{
                    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                    transition: dragY > 0 ? 'none' : `transform ${DURATION.base}ms ${EASING.standard}`,
                    outline: 'none',
                    viewTransitionName: morph ? MORPH_NAME : undefined,
                }}
            >
                {/* Drag handle */}
                <div
                    ref={handleRef}
                    className="sheet-handle"
                />
                {/* Title row with close button */}
                <div className="flex items-center justify-between gap-2 mb-4">
                    {header ?? <div className="sheet-title mb-0">{title}</div>}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('action.close')}
                        className="w-11 h-11 rounded-full flex items-center justify-center text-muted active:opacity-60 flex-shrink-0"
                        style={{background: 'rgba(255,255,255,0.07)', fontSize: 16, lineHeight: 1}}
                    >
                        ✕
                    </button>
                </div>
                {inner}
            </div>
            {overlays}
        </div>
    )
}
