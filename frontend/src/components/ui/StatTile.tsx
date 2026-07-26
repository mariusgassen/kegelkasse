import type {ReactNode} from 'react'

/** Semantic colour of the tile's value. */
export type StatTone = 'default' | 'accent' | 'positive' | 'negative' | 'muted'

const TONE_CLASS: Record<StatTone, string> = {
    default: 'text-ink',
    accent: 'text-accent-fg',
    positive: 'text-positive-fg',
    negative: 'text-danger-fg',
    muted: 'text-muted',
}

const SIZE_CLASS = {sm: 'text-base', md: 'text-lg', lg: 'text-xl'} as const

interface StatTileProps {
    value: ReactNode
    label: string
    tone?: StatTone
    /** `lg` for the headline tiles of a summary grid, `sm` when the value is a long composite. */
    size?: 'sm' | 'md' | 'lg'
    /** Turns the tile into a button. A tile without an action stays a plain card. */
    onClick?: () => void
    disabled?: boolean
    /** Drop the card chrome — for tiles already sitting inside a card's grid. */
    bare?: boolean
    className?: string
    'data-testid'?: string
}

/**
 * One number with its caption. The single shape behind every metric grid in the
 * app (evening summary, year stats, profile, treasury totals).
 */
export function StatTile({
    value, label, tone = 'accent', size = 'md', onClick, disabled, bare, className = '', ...rest
}: StatTileProps) {
    const body = (
        <>
            <div className={`font-display font-bold ${SIZE_CLASS[size]} leading-tight ${TONE_CLASS[tone]}`}>{value}</div>
            <div className="text-xs text-muted font-bold tracking-wider mt-0.5 uppercase">{label}</div>
        </>
    )
    const shell = bare ? 'text-center' : 'kce-card p-3 text-center'

    if (!onClick) {
        return <div className={`${shell} ${className}`} data-testid={rest['data-testid']}>{body}</div>
    }
    return (
        <button type="button"
                className={`${shell} active:opacity-70 transition-opacity disabled:opacity-40 ${className}`}
                onClick={onClick}
                disabled={disabled}
                data-testid={rest['data-testid']}>
            {body}
        </button>
    )
}
