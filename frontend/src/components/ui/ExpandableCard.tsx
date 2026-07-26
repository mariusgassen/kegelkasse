import {type ReactNode, useState} from 'react'

interface ExpandableCardProps {
    /** Header content — usually an emoji plus a short label. */
    title: ReactNode
    children: ReactNode
    /** Start expanded. Uncontrolled unless `open`/`onToggle` are supplied. */
    defaultOpen?: boolean
    /** Controlled mode: pass both to own the state. */
    open?: boolean
    onToggle?: (next: boolean) => void
    /** Drop the card chrome — for disclosure rows nested inside another card. */
    bare?: boolean
    /** Extra classes on the header button (density / typography per site). */
    headerClassName?: string
    /** Extra classes on the expanded body. */
    bodyClassName?: string
    className?: string
    'data-testid'?: string
}

/**
 * Header button plus collapsible body, with the chevron and `aria-expanded`
 * wiring done once. Replaces the hand-rolled `show*` toggles that each page
 * used to reimplement.
 */
export function ExpandableCard({
    title, children, defaultOpen = false, open, onToggle,
    bare, headerClassName = '', bodyClassName = '', className = '', ...rest
}: ExpandableCardProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const isOpen = open ?? internalOpen

    const toggle = () => {
        const next = !isOpen
        if (open === undefined) setInternalOpen(next)
        onToggle?.(next)
    }

    return (
        <div className={`${bare ? '' : 'kce-card overflow-hidden'} ${className}`} data-testid={rest['data-testid']}>
            <button type="button"
                    className={`w-full flex items-center justify-between gap-2 text-left ${bare ? '' : 'p-3'} ${headerClassName}`}
                    aria-expanded={isOpen}
                    onClick={toggle}>
                <span className="min-w-0">{title}</span>
                <span className="text-muted flex-shrink-0" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && <div className={`${bare ? '' : 'px-3 pb-3'} ${bodyClassName}`}>{children}</div>}
        </div>
    )
}
