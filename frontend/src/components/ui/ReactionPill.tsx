/**
 * A reaction pill button (heart or emoji) that toggles the reaction on tap and,
 * on long-press, shows a popover listing which users reacted.
 */
import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {useLongPress} from '@/hooks/useLongPress'
import {useT} from '@/i18n'

interface Props {
    className: string
    title?: string
    onClick: () => void
    users: string[]
    children: React.ReactNode
}

export function ReactionPill({className, title, onClick, users, children}: Props) {
    const t = useT()
    const btnRef = useRef<HTMLButtonElement>(null)
    const [pos, setPos] = useState<{top: number; left: number} | null>(null)
    const safeUsers = users ?? []

    function openList() {
        if (!btnRef.current || safeUsers.length === 0) return
        const rect = btnRef.current.getBoundingClientRect()
        setPos({
            top: rect.bottom + 6,
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
            <button ref={btnRef} type="button" className={className} title={title} {...longPress}>
                {children}
            </button>
            {pos && safeUsers.length > 0 && createPortal(
                <div
                    role="tooltip"
                    style={{position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 200}}
                    className="kce-card p-2 shadow-lg"
                >
                    <p className="text-[10px] font-bold text-kce-muted mb-1">{t('comment.reaction.reactedBy')}</p>
                    <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                        {safeUsers.map((name, i) => (
                            <li key={i} className="text-xs text-kce-cream truncate">{name}</li>
                        ))}
                    </ul>
                </div>,
                document.body,
            )}
        </>
    )
}
