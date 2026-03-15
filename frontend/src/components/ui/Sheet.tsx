import {type ReactNode, useEffect} from 'react'

interface SheetProps {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
    onSubmit?: () => void
}

export function Sheet({open, onClose, title, children, onSubmit}: SheetProps) {
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
        return () => { document.body.style.overflow = '' }
    }, [open])

    if (!open) return null

    const inner = onSubmit ? (
        <form onSubmit={e => { e.preventDefault(); onSubmit() }}>
            {children}
        </form>
    ) : children

    return (
        <div className="bottom-sheet" onClick={e => {
            if (e.target === e.currentTarget) onClose()
        }}>
            <div className="sheet-panel safe-bottom">
                <div className="sheet-handle"/>
                <div className="sheet-title">{title}</div>
                {inner}
            </div>
        </div>
    )
}
