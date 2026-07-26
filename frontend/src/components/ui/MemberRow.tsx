import type {ReactNode} from 'react'
import {Avatar} from './Avatar'
import {MemberBadges} from './MemberBadges'
import type {ClubPin} from '@/types'

interface MemberRowProps {
    /** Kegelname — always pass `nickname || name`. */
    name: string
    /** Legal name, shown small underneath when a nickname is in use. */
    subtitle?: ReactNode
    /** Extra muted line below the subtitle (username, hints, …). */
    meta?: ReactNode
    avatar?: string | null
    /** `muted` marks guests with a flat grey avatar disc. */
    avatarVariant?: 'default' | 'muted'
    isMe?: boolean
    isKing?: boolean
    isPresident?: boolean
    pins?: ClubPin[]
    /** Roster member id the pins are matched against. */
    memberId?: number | null
    /** Rendered between the name block and the chevron (badges, amounts, ✓ markers). */
    trailing?: ReactNode
    /**
     * Makes the whole row tappable. A `›` chevron is shown so the affordance is
     * visible rather than implied — rows without an action stay inert.
     */
    onClick?: () => void
    /** Accessible name for the tappable row; falls back to the display name. */
    actionLabel?: string
    className?: string
}

/**
 * The canonical member list entry: avatar, Kegelname, badge cluster, optional
 * secondary lines and a trailing slot. Used by every roster, account and ranking
 * list so display-name, Ich-badge and pin rules live in exactly one place.
 */
export function MemberRow({
    name, subtitle, meta, avatar, avatarVariant, isMe, isKing, isPresident, pins, memberId,
    trailing, onClick, actionLabel, className = '',
}: MemberRowProps) {
    const interactive = !!onClick
    return (
        <div
            className={`kce-card p-3 flex items-center gap-3 ${interactive ? 'cursor-pointer active:opacity-70 transition-opacity' : ''} ${className}`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? (actionLabel ?? name) : undefined}
            onClick={onClick}
            onKeyDown={interactive ? e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onClick?.()
                }
            } : undefined}>
            <Avatar name={name} src={avatar} variant={avatarVariant}/>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                    {name}
                    <MemberBadges isMe={isMe} isKing={isKing} isPresident={isPresident} pins={pins} memberId={memberId}/>
                </div>
                {subtitle && <div className="text-xs text-kce-muted truncate">{subtitle}</div>}
                {meta && <div className="text-[10px] text-kce-muted truncate">{meta}</div>}
            </div>
            {trailing}
            {interactive && <span className="text-kce-muted text-lg flex-shrink-0" aria-hidden="true">›</span>}
        </div>
    )
}
