import type {ReactNode} from 'react'
import {Sheet} from './Sheet.tsx'
import {useT} from '@/i18n'
import {Button} from '@/components/ui/Button.tsx'

interface ConfirmSheetProps {
    open: boolean
    onClose: () => void
    title: string
    message?: ReactNode
    onConfirm: () => void
    /** Defaults to "Delete" (action.confirmDelete). */
    confirmLabel?: string
    /** Render the message in the danger colour (for warnings, not plain questions). */
    warning?: boolean
    busy?: boolean
    /** Extra content between the message and the buttons (e.g. a reason input). */
    children?: ReactNode
    /** Show a Cancel button next to the confirm button (otherwise the confirm button is full width). */
    withCancel?: boolean
}

/** Confirm-before-destructive bottom sheet: a message, optional extra content, one red button (plus optional Cancel). */
export function ConfirmSheet({open, onClose, title, message, onConfirm, confirmLabel, warning, busy, children, withCancel}: ConfirmSheetProps) {
    const t = useT()
    return (
        <Sheet open={open} onClose={onClose} title={title}>
            <div className="flex flex-col gap-3">
                {message && <p className={`text-sm ${warning ? 'text-danger-fg' : 'text-muted'}`}>{message}</p>}
                {children}
                <div className="flex gap-2">
                    {withCancel && (
                        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
                            {t('action.cancel')}
                        </Button>
                    )}
                    <Button type="button" variant="danger" block={!withCancel} className={withCancel ? 'flex-1' : undefined}
                            disabled={busy} onClick={onConfirm}>
                        {confirmLabel ?? t('action.confirmDelete')}
                    </Button>
                </div>
            </div>
        </Sheet>
    )
}
