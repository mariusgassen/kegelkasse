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
    onReply,
    depth = 0,
}: {
    comment: Comment
    onDeleted: () => void
    onReacted: () => void
    onReply?: (comment: Comment) => void
    depth?: number
}) {
    const t = useT()
    const qc = useQueryClient()
    const {user} = useAppStore()
    const isOwn = comment.created_by_id === user?.id
    const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
    const canDelete = isOwn || isAdmin
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(comment.text ?? '')
    const [editMediaUrl, setEditMediaUrl] = useState<string | null>(comment.media_url)

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

    async function handleSaveEdit() {
        if (!editText.trim() && !editMediaUrl) return
        try {
            await api.editComment(comment.id, editText.trim() || null, editMediaUrl)
            setEditing(false)
            onReacted() // triggers refetch
        } catch (e) {
            toastError(e)
        }
    }

    const displayText = comment.text
    const displayMediaUrl = comment.media_url

    return (
        <div className={depth > 0 ? 'pl-3 border-l border-kce-border/30' : ''}>
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
                            {comment.edited_at && (
                                <span className="text-[10px] text-kce-muted italic">
                                    ({t('comment.edited')} {fDateTime(comment.edited_at)})
                                </span>
                            )}
                        </div>

                        {editing ? (
                            <div className="flex flex-col gap-1.5 mt-1">
                                <div className="flex gap-1.5">
                                    <input
                                        className="kce-input flex-1 text-xs py-1"
                                        value={editText}
                                        onChange={e => setEditText(e.target.value)}
                                        autoFocus
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit() }
                                            if (e.key === 'Escape') setEditing(false)
                                        }}
                                    />
                                    <MediaUploadButton
                                        value={editMediaUrl}
                                        onUploaded={setEditMediaUrl}
                                        onRemove={() => setEditMediaUrl(null)}
                                    />
                                </div>
                                <div className="flex gap-1.5">
                                    <button type="button" className="btn-primary btn-xs"
                                            disabled={!editText.trim() && !editMediaUrl}
                                            onClick={handleSaveEdit}>
                                        {t('action.save')}
                                    </button>
                                    <button type="button" className="btn-secondary btn-xs"
                                            onClick={() => { setEditing(false); setEditText(comment.text ?? ''); setEditMediaUrl(comment.media_url) }}>
                                        {t('action.cancel')}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {displayText && (
                                    <p className="text-xs text-kce-muted mt-0.5 leading-relaxed whitespace-pre-wrap">
                                        {displayText}
                                    </p>
                                )}
                                {displayMediaUrl && (
                                    <img
                                        src={displayMediaUrl}
                                        alt=""
                                        className="mt-1 rounded max-h-48 max-w-full object-contain border border-kce-border/40"
                                    />
                                )}
                            </>
                        )}
                    </div>

                    {/* Action buttons */}
                    {!editing && (
                        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                            {depth === 0 && onReply && (
                                <button type="button"
                                        className="text-[10px] text-kce-muted hover:text-kce-cream px-1 py-0.5 rounded"
                                        onClick={() => onReply(comment)}
                                        title={t('comment.reply')}>
                                    ↩
                                </button>
                            )}
                            {isOwn && (
                                <button type="button"
                                        className="text-[10px] text-kce-muted hover:text-kce-cream px-1 py-0.5 rounded"
                                        onClick={() => { setEditing(true); setEditText(comment.text ?? ''); setEditMediaUrl(comment.media_url) }}
                                        title={t('action.edit')}>
                                    ✏️
                                </button>
                            )}
                            {canDelete && !confirmDelete && (
                                <button type="button"
                                        className="text-kce-muted hover:text-red-400 text-xs leading-none px-1 py-0.5 rounded"
                                        onClick={() => setConfirmDelete(true)}
                                        title={t('action.delete')}>
                                    ×
                                </button>
                            )}
                            {confirmDelete && (
                                <>
                                    <button type="button"
                                            className="text-[10px] text-red-400 font-bold px-1 py-0.5 rounded hover:bg-red-400/10"
                                            onClick={handleDelete}>
                                        {t('action.confirmDelete')}
                                    </button>
                                    <button type="button"
                                            className="text-[10px] text-kce-muted px-1 py-0.5 rounded"
                                            onClick={() => setConfirmDelete(false)}>
                                        {t('action.cancel')}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Reactions row */}
                {!editing && (
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
                )}
            </div>

            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
                <div className="mt-2 flex flex-col gap-2">
                    {comment.replies.map(reply => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            onDeleted={onDeleted}
                            onReacted={onReacted}
                            depth={1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export function CommentThread({parentType, parentId}: Props) {
    const t = useT()
    const qc = useQueryClient()
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const [mediaUrl, setMediaUrl] = useState<string | null>(null)
    const [replyTo, setReplyTo] = useState<Comment | null>(null)
    const [saving, setSaving] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const queryKey = ['comments', parentType, parentId]
    // Always fetch so count is visible even when collapsed; staleTime avoids unnecessary requests
    const {data: comments = [], isLoading} = useQuery({
        queryKey,
        queryFn: () => api.listComments(parentType, parentId),
        staleTime: 30000,
    })

    function invalidate() {
        qc.invalidateQueries({queryKey})
    }

    function handleReply(comment: Comment) {
        setReplyTo(comment)
        const name = comment.created_by_name || t('comment.unknown')
        setText(prev => `@${name} ${prev}`.trimStart())
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 150)
    }

    async function handleAdd() {
        if (!text.trim() && !mediaUrl || saving) return
        setSaving(true)
        try {
            await api.addComment(parentType, parentId, text.trim(), mediaUrl ?? undefined, replyTo?.id)
            setText('')
            setMediaUrl(null)
            setReplyTo(null)
            await qc.invalidateQueries({queryKey})
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0)
    const countLabel = totalCount > 0 ? ` (${totalCount})` : ''
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
                    {open ? t('comment.collapse') : t('comment.show')}
                    {countLabel}
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
                            onReply={handleReply}
                        />
                    ))}

                    {/* New comment input */}
                    <div className="flex flex-col gap-1.5 mt-1">
                        {replyTo && (
                            <div className="flex items-center gap-1 text-[10px] text-kce-muted">
                                <span>↩ {t('comment.replyingTo')} <strong>{replyTo.created_by_name || t('comment.unknown')}</strong></span>
                                <button type="button" className="hover:text-kce-cream" onClick={() => { setReplyTo(null); setText('') }}>×</button>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                className="kce-input flex-1 text-xs py-1.5"
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder={replyTo ? `@${replyTo.created_by_name || ''}…` : t('comment.placeholder')}
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
