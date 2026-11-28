import {MeBadge} from '@/components/ui/MemberBadges'
import {HOLD_MS} from '@/lib/capture.ts'
import {useT} from '@/i18n'

/** Drains along the bottom of a selected tile until the selection lets go by itself. */
export function HoldBar({holdKey}: { holdKey: number }) {
    return <span key={holdKey} className="kce-hold" style={{animationDuration: `${HOLD_MS}ms`}} aria-hidden="true"/>
}

interface PlayerTileProps {
    name: string
    isMe?: boolean
    isKing?: boolean
    /** Next to throw (throw tracking). Only a marker: it never selects anyone. */
    isCurrent?: boolean
    pressed: boolean
    onClick: () => void
    /** Penalties are collected and waiting for a person. */
    waiting?: boolean
    /** Already received the collected penalties. */
    delivered?: boolean
    holdKey?: number
    /** Amount line. */
    value: string
    /** Drinks, game score or the drink-round state. */
    detail?: string
    /** Amount that is being saved for this person right now. */
    pending?: string
}

export function PlayerTile({
    name, isMe, isKing, isCurrent, pressed, onClick, waiting, delivered, holdKey, value, detail, pending,
}: PlayerTileProps) {
    const t = useT()
    const sub = pressed ? 'text-on-accent' : 'text-muted'
    const look = pressed ? 'border-accent bg-accent text-on-accent'
        : delivered ? 'border-accent bg-accent-tint'
            : waiting ? 'border-dashed border-accent bg-surface'
                : isCurrent ? 'border-positive bg-surface' : 'border-transparent bg-surface'
    return (
        <button type="button" aria-pressed={pressed} onClick={onClick}
                className={`relative flex min-h-[5.5rem] min-w-0 flex-col justify-between gap-0.5 overflow-hidden rounded-xl border-2 px-2.5 py-2 text-left transition-transform active:scale-[.97] ${look}`}>
            <span className="flex min-w-0 items-center gap-1">
                {isKing && <span aria-hidden="true">👑</span>}
                <span className="truncate text-sm font-extrabold">{name}</span>
                {isMe && <MeBadge/>}
            </span>
            <span className="font-display text-xl font-bold leading-tight">{value}</span>
            <span className={`truncate text-xs ${sub}`}>
                {isCurrent && <span className={pressed ? 'font-bold' : 'font-bold text-positive-fg'}>{t('quickEntry.currentPlayer')} </span>}
                {detail}
                {delivered && <span> ✓ {t('capture.delivered')}</span>}
            </span>
            {pending && (
                <span className="kce-booked-chip absolute right-1.5 top-8 whitespace-nowrap rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent">
                    {pending}
                </span>
            )}
            {pressed && holdKey !== undefined && <HoldBar holdKey={holdKey}/>}
        </button>
    )
}
