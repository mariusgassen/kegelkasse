/**
 * Emoji reaction row for highlight, announcement, and trip items.
 * Heart (❤️) is the primary reaction; other emojis are secondary pills.
 * Optionally renders a 💬 (N) comment toggle in the same row.
 */
import {useState, useRef, useEffect} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import EmojiPicker, {EmojiClickData, Theme} from 'emoji-picker-react'
import {createPortal} from 'react-dom'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {toastError} from '@/utils/error'
import type {Comment, ItemReaction} from '@/types'

const PICKER_W = 300
const PICKER_H = 380

const PILL = 'flex items-center gap-1 text-sm px-2.5 py-1 rounded-full border leading-none transition-colors cursor-pointer'

function ReactionPicker({onPick}: {onPick: (emoji: string) => void}) {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({top: 0, left: 0})
    const btnRef = useRef<HTMLButtonElement>(null)
    const pickerRef = useRef<HTMLDivElement>(null)

    function openPicker() {
        if (!btnRef.current) return
        const rect = btnRef.current.getBoundingClientRect()
        const spaceAbove = rect.top
        const spaceBelow = window.innerHeight - rect.bottom
        const top = spaceAbove >= PICKER_H + 8 || spaceAbove > spaceBelow
            ? rect.top - PICKER_H - 8
            : rect.bottom + 8
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - PICKER_W - 8))
        setPos({top, left})
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        function onMouseDown(e: MouseEvent) {
            const t = e.target as Node
            if (!btnRef.current?.contains(t) && !pickerRef.current?.contains(t)) setOpen(false)
        }
        function onScroll(e: Event) {
            if (pickerRef.current?.contains(e.target as Node)) return
            setOpen(false)
        }
        document.addEventListener('mousedown', onMouseDown)
        document.addEventListener('scroll', onScroll, true)
        return () => {
            document.removeEventListener('mousedown', onMouseDown)
            document.removeEventListener('scroll', onScroll, true)
        }
    }, [open])

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={`${PILL} border-kce-border text-kce-muted hover:border-kce-border/70`}
                onClick={openPicker}
                title="Reaktion hinzufügen"
            >
                +😀
            </button>
            {open && createPortal(
                <div ref={pickerRef} style={{position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999}}>
                    <EmojiPicker
                        onEmojiClick={(data: EmojiClickData) => {onPick(data.emoji); setOpen(false)}}
                        theme={Theme.DARK}
                        height={PICKER_H}
                        width={PICKER_W}
                        searchDisabled
                        skinTonesDisabled
                        previewConfig={{showPreview: false}}
                    />
                </div>,
                document.body,
            )}
        </>
    )
}

interface Props {
    parentType: 'highlight' | 'announcement' | 'trip'
    parentId: number
    /** When provided, a 💬 (N) button is shown in the same row */
    commentOpen?: boolean
    onCommentToggle?: () => void
}

export function ItemReactionBar({parentType, parentId, commentOpen, onCommentToggle}: Props) {
    const t = useT()
    const qc = useQueryClient()
    const reactionKey = ['item-reactions', parentType, parentId]
    const commentKey = ['comments', parentType, parentId]

    const {data: reactions = []} = useQuery<ItemReaction[]>({
        queryKey: reactionKey,
        queryFn: () => api.getItemReactions(parentType, parentId),
        staleTime: 30000,
    })

    // Fetch comment count from shared cache (same key as CommentThread)
    const {data: comments = []} = useQuery<Comment[]>({
        queryKey: commentKey,
        queryFn: () => api.listComments(parentType, parentId),
        staleTime: 30000,
        enabled: onCommentToggle !== undefined,
    })
    const commentCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0)

    async function handleToggle(emoji: string) {
        try {
            const res = await api.toggleItemReaction(parentType, parentId, emoji)
            qc.setQueryData(reactionKey, res.reactions)
        } catch (e) {
            toastError(e)
        }
    }

    const heartReaction = reactions.find(r => r.emoji === '❤️')
    const otherReactions = reactions.filter(r => r.emoji !== '❤️')
    const showComments = onCommentToggle !== undefined

    return (
        <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-kce-border/20">
            {/* 💬 comment toggle — same size as other pills */}
            {showComments && (
                <button
                    type="button"
                    onClick={onCommentToggle}
                    className={[PILL, commentOpen
                        ? 'border-kce-primary bg-kce-primary/10 text-kce-cream'
                        : 'border-kce-border text-kce-muted hover:border-kce-border/70',
                    ].join(' ')}
                    title="Kommentare"
                >
                    <span>💬</span>
                    <span className="text-xs font-medium">{commentCount}</span>
                </button>
            )}

            {/* Primary heart reaction */}
            <button
                type="button"
                onClick={() => handleToggle('❤️')}
                className={[PILL, heartReaction?.reacted_by_me
                    ? 'border-red-400/60 bg-red-400/10 text-red-400'
                    : 'border-kce-border text-kce-muted hover:border-red-400/40 hover:text-red-400/70',
                ].join(' ')}
                title={heartReaction?.reacted_by_me ? t('comment.reaction.remove') : t('comment.reaction.add')}
            >
                <span>{heartReaction?.reacted_by_me ? '❤️' : '🤍'}</span>
                {heartReaction && heartReaction.count > 0 && (
                    <span className="text-xs font-medium">{heartReaction.count}</span>
                )}
            </button>

            {/* Other reactions — same pill size */}
            {otherReactions.map(r => (
                <button
                    key={r.emoji}
                    type="button"
                    onClick={() => handleToggle(r.emoji)}
                    className={[PILL, r.reacted_by_me
                        ? 'border-kce-primary bg-kce-primary/20 text-kce-cream'
                        : 'border-kce-border text-kce-muted hover:border-kce-primary/50',
                    ].join(' ')}
                    title={r.reacted_by_me ? t('comment.reaction.remove') : t('comment.reaction.add')}
                >
                    <span>{r.emoji}</span>
                    <span className="text-xs font-medium">{r.count}</span>
                </button>
            ))}

            <ReactionPicker onPick={handleToggle}/>
        </div>
    )
}
