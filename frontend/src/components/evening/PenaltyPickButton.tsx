import type {CSSProperties, ReactNode} from 'react'
import {useLongPress} from '@/hooks/useLongPress'
import {playSound} from '@/lib/soundboard'
import {useAudioCallouts} from '@/hooks/useClub'
import type {PenaltyType} from '@/types'

interface PenaltyPickButtonProps {
    type: PenaltyType
    onSelect: () => void
    children: ReactNode
    className?: string
    style?: CSSProperties
    disabled?: boolean
}

/**
 * A penalty in the quick selection: tap to pick it, press and hold to hear its call-out.
 *
 * With a call-out on nearly every penalty type, nobody at the lane remembers which one is which,
 * and the only way to find out used to be booking it. Holding previews the sound without writing
 * anything — the same gesture that already reveals who reacted to a comment (`useLongPress`).
 *
 * The preview goes through `playSound`, not `previewSound`: it obeys both the club's audio switch
 * and the member's personal effects switch, so what you hear on hold is exactly what the room will
 * hear when the penalty is logged. When nothing would play, the gesture isn't attached at all.
 */
export function PenaltyPickButton({type, onSelect, children, className, style, disabled}: PenaltyPickButtonProps) {
    const audioCallouts = useAudioCallouts()
    const hasSound = audioCallouts && !!type.sound_key

    const longPress = useLongPress({
        onLongPress: () => playSound(type.sound_key),
        onClick: onSelect,
    })

    const handlers = hasSound ? longPress : {onClick: onSelect}

    return (
        <button type="button" className={className} style={style} disabled={disabled} {...handlers}>
            {children}
        </button>
    )
}
