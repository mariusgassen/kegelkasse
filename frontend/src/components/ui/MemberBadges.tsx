import {useT} from '@/i18n'
import type {ClubPin} from '@/types'

interface MeBadgeProps {
    /** Use on a filled/selected pill, where amber-on-primary would not read. */
    inverted?: boolean
    className?: string
}

/** Amber "Ich" marker shown next to the current user's entry in every member list. */
export function MeBadge({inverted, className = ''}: MeBadgeProps) {
    const t = useT()
    return (
        <span className={`text-xs font-bold flex-shrink-0 ${inverted ? 'text-on-accent' : 'text-accent-fg'} ${className}`}>
            {t('common.me')}
        </span>
    )
}

interface PinBadgesProps {
    pins: ClubPin[]
    /** Roster member whose pins should be shown. */
    memberId: number | null | undefined
}

/**
 * Club pin emoji carried by a member.
 *
 * The pin name is exposed as an `aria-label` rather than a `title` tooltip:
 * `title` is invisible on touch devices, which is where this app is used.
 */
export function PinBadges({pins, memberId}: PinBadgesProps) {
    if (memberId == null) return null
    const held = pins.filter(p => p.holder_regular_member_id === memberId)
    if (held.length === 0) return null
    return (
        <>
            {held.map(pin => (
                <span key={pin.id} role="img" aria-label={pin.name} className="flex-shrink-0">{pin.icon}</span>
            ))}
        </>
    )
}

interface MemberBadgesProps {
    isMe?: boolean
    pins?: ClubPin[]
    memberId?: number | null
    /** Crown for the evening's Eröffnungsspiel winner. */
    isKing?: boolean
    /** Target for the yearly Präsidentenspiel winner. */
    isPresident?: boolean
}

/**
 * The badge cluster that follows a member's display name: Ich marker, king/president
 * flags and any club pins they hold. Order is stable across every list.
 */
export function MemberBadges({isMe, pins, memberId, isKing, isPresident}: MemberBadgesProps) {
    const t = useT()
    return (
        <>
            {isMe && <MeBadge/>}
            {isKing && <span role="img" aria-label={t('achievement.king.title')} className="flex-shrink-0">👑</span>}
            {isPresident && <span role="img" aria-label={t('achievement.president.title')} className="flex-shrink-0">🎯</span>}
            {pins && <PinBadges pins={pins} memberId={memberId}/>}
        </>
    )
}
