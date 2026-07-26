import {useState} from 'react'
import {MoreVertical} from 'lucide-react'
import {useT} from '@/i18n'
import {Sheet} from '@/components/ui/Sheet.tsx'

/** A single action in a row/card action menu. */
export type SheetAction = {
    icon: string
    label: string
    onClick: () => void
    danger?: boolean
    disabled?: boolean
}

/**
 * One tappable action inside an action sheet — icon + bold label, red when `danger`.
 * Shared by every "tap the row / ⋮ → pick an action" surface so edit/delete/… look and
 * behave the same everywhere (Members roster, Neuigkeiten, …).
 */
export function ActionItem({icon, label, onClick, danger, disabled}: SheetAction) {
    return (
        <button type="button" disabled={disabled}
                className={`kce-card p-3 flex items-center gap-3 text-left active:opacity-70 disabled:opacity-40 ${danger ? 'text-danger-fg' : ''}`}
                onClick={onClick}>
            <span className="text-lg flex-shrink-0" aria-hidden="true">{icon}</span>
            <span className="text-sm font-bold flex-1">{label}</span>
        </button>
    )
}

/**
 * The neutral "⋮" trigger that opens an action menu. Deliberately non-destructive-looking —
 * unlike a bare "×", it does not read as "dismiss/discard", so the actual delete lives one
 * clearly-labelled tap deeper inside the sheet.
 */
export function MoreButton({onClick, label}: {onClick: () => void; label?: string}) {
    const t = useT()
    return (
        <button
            type="button"
            aria-label={label ?? t('action.more')}
            title={label ?? t('action.more')}
            className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-white/5 transition-colors"
            onClick={onClick}>
            <MoreVertical size={18} strokeWidth={2}/>
        </button>
    )
}

/**
 * Self-contained "⋮ → action menu" for a card. Renders the neutral kebab trigger and its own
 * bottom sheet; picking an action closes the sheet and runs it. Destructive actions live here
 * (labelled + red) instead of as a bare icon on the card, so nothing reads as an accidental
 * one-tap delete. Renders nothing when there are no actions.
 */
export function CardActionMenu({title, actions, label}: {
    title: string
    actions: SheetAction[]
    label?: string
}) {
    const [open, setOpen] = useState(false)
    if (actions.length === 0) return null
    return (
        <>
            <MoreButton label={label} onClick={() => setOpen(true)}/>
            <Sheet open={open} onClose={() => setOpen(false)} title={title}>
                <div className="flex flex-col gap-2">
                    {actions.map((a, i) => (
                        <ActionItem key={i} {...a} onClick={() => { setOpen(false); a.onClick() }}/>
                    ))}
                </div>
            </Sheet>
        </>
    )
}
