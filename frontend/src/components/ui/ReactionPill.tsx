/**
 * A reaction pill button (heart or emoji) that toggles the reaction on tap and,
 * on long-press, shows a popover listing every reaction on the item (grouped by
 * emoji) and who gave each one — not just the emoji of the pill that was held.
 */
import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {useLongPress} from '@/hooks/useLongPress'
import {useT} from '@/i18n'

interface ReactionGroup {
    emoji: string
    users: string[]
}

interface Props {
    className: string
    title?: string
    onClick: () => void
    /** Every reaction group on this item — holding any pill shows the full breakdown, not just this pill's own. */
    allReactions: ReactionGroup[]
    children: React.ReactNode
}

export function ReactionPill({className, title, onClick, allReactions, children}: Props) {
    const t = useT()
    const btnRef = useRef<HTMLButtonElement>(null)
    const [pos, setPos] = useState<{bottom: number; left: number} | null>(null)
    const groups = allReactions ?? []

    function openList() {
        if (!btnRef.current || groups.length === 0) return
        const rect = btnRef.current.getBoundingClientRect()
        // Anchored from the viewport bottom so the box grows upward from above the button,
        // regardless of its (variable) height — a finger holding the button would otherwise
        // cover a popover placed below it.
        setPos({
            bottom: window.innerHeight - rect.top + 6,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 208)),
        })
    }

    const longPress = useLongPress({onLongPress: openList, onClick})

    useEffect(() => {
        if (!pos) return
        function onDocDown(e: MouseEvent) {
            if (!btnRef.current?.contains(e.target as Node)) setPos(null)
        }
        document.addEventListener('mousedown', onDocDown)
        return () => document.removeEventListener('mousedown', onDocDown)
    }, [pos])

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`${className} select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]`}
                title={title}
                {...longPress}
            >
                {children}
            </button>
            {pos && groups.length > 0 && createPortal(
                <div
                    role="tooltip"
                    style={{position: 'fixed', bottom: pos.bottom, left: pos.left, zIndex: 9999, width: 200}}
                    className="kce-card p-2 shadow-lg"
                >
                    <p className="text-[10px] font-bold text-kce-muted mb-1">{t('comment.reaction.reactedBy')}</p>
                    <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                        {groups.map(group => (
                            <li key={group.emoji} className="text-xs text-kce-cream truncate">
                                <span className="mr-1">{group.emoji}</span>{group.users.join(', ')}
                            </li>
                        ))}
                    </ul>
                </div>,
                document.body,
            )}
        </>
    )
}
