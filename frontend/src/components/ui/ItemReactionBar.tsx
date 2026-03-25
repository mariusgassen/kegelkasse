/**
 * Emoji reaction row for highlight and announcement items (not comments).
 * Fetches reactions and supports toggle via POST /comments/item-reaction/{type}/{id}.
 */
import {useState, useRef, useEffect} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import EmojiPicker, {EmojiClickData, Theme} from 'emoji-picker-react'
import {createPortal} from 'react-dom'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {toastError} from '@/utils/error'
import type {ItemReaction} from '@/types'

const PICKER_W = 300
const PICKER_H = 380

function ReactionPicker({onPick}: { onPick: (emoji: string) => void }) {
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
                className="text-[11px] text-kce-muted hover:text-kce-cream transition-colors leading-none px-1 py-0.5 rounded"
                onClick={openPicker}
                title="Reaktion hinzufügen"
            >
                +😀
            </button>
            {open && createPortal(
                <div ref={pickerRef} style={{position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999}}>
                    <EmojiPicker
                        onEmojiClick={(data: EmojiClickData) => { onPick(data.emoji); setOpen(false) }}
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
    parentType: 'highlight' | 'announcement'
    parentId: number
}

export function ItemReactionBar({parentType, parentId}: Props) {
    const t = useT()
    const qc = useQueryClient()
    const queryKey = ['item-reactions', parentType, parentId]

    const {data: reactions = []} = useQuery<ItemReaction[]>({
        queryKey,
        queryFn: () => api.getItemReactions(parentType, parentId),
        staleTime: 30000,
    })

    async function handleToggle(emoji: string) {
        try {
            const res = await api.toggleItemReaction(parentType, parentId, emoji)
            qc.setQueryData(queryKey, res.reactions)
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div className="flex items-center gap-1 flex-wrap mt-1.5">
            {reactions.map(r => (
                <button
                    key={r.emoji}
                    type="button"
                    onClick={() => handleToggle(r.emoji)}
                    className={[
                        'text-[11px] px-1.5 py-0.5 rounded-full border leading-none transition-colors',
                        r.reacted_by_me
                            ? 'border-kce-primary bg-kce-primary/20 text-kce-cream'
                            : 'border-kce-border text-kce-muted hover:border-kce-primary/50',
                    ].join(' ')}
                    title={r.reacted_by_me ? t('comment.reaction.remove') : t('comment.reaction.add')}
                >
                    {r.emoji} {r.count}
                </button>
            ))}
            <ReactionPicker onPick={handleToggle}/>
        </div>
    )
}
