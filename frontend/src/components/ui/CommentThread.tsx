import {useState, useRef, useEffect} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import EmojiPicker, {EmojiClickData, Theme} from 'emoji-picker-react'
import {createPortal} from 'react-dom'
import {api} from '@/api/client'
import {useAppStore} from '@/store/app'
import {useT} from '@/i18n'
import {toastError} from '@/utils/error'
import {MediaUploadButton} from '@/components/ui/MediaUploadButton'
import type {Comment} from '@/types'

function fDateTime(isoStr: string) {
    return new Date(isoStr).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

interface Props {
    parentType: 'highlight' | 'announcement'
    parentId: number
}

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

    function handlePick(data: EmojiClickData) {
        onPick(data.emoji)
        setOpen(false)
    }

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
                        onEmojiClick={handlePick}
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

function CommentItem({
    comment,
    onDeleted,
    onReacted,
}: {
    comment: Comment
    onDeleted: () => void
    onReacted: () => void
}) {
    const t = useT()
    const {user} = useAppStore()
    const isOwn = comment.created_by_id === user?.id
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
    const canDelete = isOwn || isAdmin

    async function handleDelete() {
        try {
            await api.deleteComment(comment.id)
            onDeleted()
        } catch (e) {
            toastError(e)
        }
    }

    async function handleReaction(emoji: string) {
        try {
            await api.toggleReaction(comment.id, emoji)
            onReacted()
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-[11px] font-bold text-kce-cream">
                            {comment.created_by_name || t('comment.unknown')}
                        </span>
                        {comment.created_at && (
                            <span className="text-[10px] text-kce-muted">{fDateTime(comment.created_at)}</span>
                        )}
                    </div>
                    {comment.text && (
                        <p className="text-xs text-kce-muted mt-0.5 leading-relaxed whitespace-pre-wrap">
                            {comment.text}
                        </p>
                    )}
                    {comment.media_url && (
                        <img
                            src={comment.media_url}
                            alt=""
                            className="mt-1 rounded max-h-48 max-w-full object-contain border border-kce-border/40"
                        />
                    )}
                </div>
                {canDelete && (
                    <button
                        type="button"
                        className="text-kce-muted hover:text-red-400 text-xs leading-none flex-shrink-0 mt-0.5 px-1"
                        onClick={handleDelete}
                        title={t('action.delete')}
                    >
                        ×
                    </button>
                )}
            </div>
            {/* Reactions row */}
            <div className="flex items-center gap-1 flex-wrap">
                {comment.reactions.map(r => (
                    <button
                        key={r.emoji}
                        type="button"
                        onClick={() => handleReaction(r.emoji)}
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
                <ReactionPicker onPick={(emoji) => handleReaction(emoji)}/>
            </div>
        </div>
    )
}

export function CommentThread({parentType, parentId}: Props) {
    const t = useT()
    const qc = useQueryClient()
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [mediaUrl, setMediaUrl] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const queryKey = ['comments', parentType, parentId]
    const {data: comments = [], isLoading} = useQuery({
        queryKey,
        queryFn: () => api.listComments(parentType, parentId),
        enabled: open,
    })

    function invalidate() {
        qc.invalidateQueries({queryKey})
    }

    async function handleAdd() {
        if (!text.trim() && !mediaUrl || saving) return
        setSaving(true)
        try {
            await api.addComment(parentType, parentId, text.trim(), mediaUrl ?? undefined)
            setText('')
            setMediaUrl(null)
            await qc.invalidateQueries({queryKey})
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    const count = open ? comments.length : undefined
    const canSubmit = (text.trim() || mediaUrl) && !saving

    return (
        <div className="mt-2">
            {/* Toggle button */}
            <button
                type="button"
                onClick={() => {
                    setOpen(v => !v)
                    if (!open) setTimeout(() => inputRef.current?.focus(), 150)
                }}
                className="flex items-center gap-1 text-[11px] text-kce-muted hover:text-kce-cream transition-colors"
            >
                <span>💬</span>
                <span>
                    {open
                        ? count !== undefined && count > 0
                            ? `${t('comment.collapse')} (${count})`
                            : t('comment.collapse')
                        : t('comment.show')}
                </span>
                <span className="text-[10px]">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="mt-2 flex flex-col gap-3 pl-2 border-l border-kce-border/40">
                    {isLoading && (
                        <p className="text-xs text-kce-muted">{t('action.loading')}</p>
                    )}
                    {!isLoading && comments.length === 0 && (
                        <p className="text-xs text-kce-muted italic">{t('comment.none')}</p>
                    )}
                    {comments.map((c: Comment) => (
                        <CommentItem
                            key={c.id}
                            comment={c}
                            onDeleted={invalidate}
                            onReacted={invalidate}
                        />
                    ))}

                    {/* New comment input */}
                    <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                className="kce-input flex-1 text-xs py-1.5"
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder={t('comment.placeholder')}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleAdd()
                                    }
                                }}
                            />
                            <MediaUploadButton
                                value={mediaUrl}
                                onUploaded={setMediaUrl}
                                onRemove={() => setMediaUrl(null)}
                            />
                            <button
                                type="button"
                                className="btn-primary btn-xs flex-shrink-0"
                                disabled={!canSubmit}
                                onClick={handleAdd}
                            >
                                ↵
                            </button>
                        </div>
                        {mediaUrl && !text && (
                            <p className="text-[10px] text-kce-muted italic pl-1">{t('media.captionHint')}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
