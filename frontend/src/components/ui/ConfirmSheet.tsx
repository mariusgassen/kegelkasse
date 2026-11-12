import type {ReactNode} from 'react'
import {Sheet} from './Sheet.tsx'
import {useT} from '@/i18n'
import {Button} from '@/components/ui/Button.tsx'

interface ConfirmSheetProps {
    open: boolean
    onClose: () => void
    title: string
    message: ReactNode
    onConfirm: () => void
    /** Defaults to "Delete" (action.confirmDelete). */
    confirmLabel?: string
    /** Render the message in the danger colour (for warnings, not plain questions). */
    warning?: boolean
    busy?: boolean
}

/** Confirm-before-destructive bottom sheet: one message, one red button. */
export function ConfirmSheet({open, onClose, title, message, onConfirm, confirmLabel, warning, busy}: ConfirmSheetProps) {
    const t = useT()
    return (
        <Sheet open={open} onClose={onClose} title={title}>
            <div className="flex flex-col gap-3">
                <p className={`text-sm ${warning ? 'text-danger-fg' : 'text-muted'}`}>{message}</p>
                <Button type="button" variant="danger" block disabled={busy} onClick={onConfirm}>
                    {confirmLabel ?? t('action.confirmDelete')}
                </Button>
            </div>
        </Sheet>
    )
}
