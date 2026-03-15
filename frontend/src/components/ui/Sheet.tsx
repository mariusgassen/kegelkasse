import {type ReactNode, useEffect} from 'react'

interface SheetProps {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
}

export function Sheet({open, onClose, title, children}: SheetProps) {
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [open])

    if (!open) return null

    return (
        <div className="bottom-sheet" onClick={e => {
            if (e.target === e.currentTarget) onClose()
        }}>
            <div className="sheet-panel safe-bottom">
                <div className="sheet-handle"/>
                <div className="sheet-title">{title}</div>
                {children}
            </div>
        </div>
    )
}
