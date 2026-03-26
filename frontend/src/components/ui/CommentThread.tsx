import {useState, useRef} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import EmojiPicker, {EmojiClickData, Theme} from 'emoji-picker-react'
import {createPortal} from 'react-dom'
import {useEffect} from 'react'
import {api} from '@/api/client'
import {useAppStore} from '@/store/app'
import {useT} from '@/i18n'
import {toastError} from '@/utils/error'
import {MediaUploadButton} from '@/components/ui/MediaUploadButton'
import type {Comment} from '@/types'

const PICKER_W = 300
const PICKER_H = 380

function fRelTime(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'gerade eben'
    if (mins < 60) return `vor ${mins} Min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `vor ${hours} Std`
    const days = Math.floor(hours / 24)
    if (days < 7) return `vor ${days} T`
    return new Date(isoStr).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})
}

export function Avatar({src, name, size = 28}: {src: string | null; name: string | null; size?: number}) {
    const initial = name ? name.slice(0, 1).toUpperCase() : '?'
    if (src) {
        return (
            <img
                src={src}
                alt=""
                className="rounded-full object-cover flex-shrink-0 border border-kce-border/30"
                style={{width: size, height: size}}
            />
        )
    }
    return (
        <div
            className="rounded-full bg-kce-surface2 flex items-center justify-center flex-shrink-0 text-kce-muted font-bold border border-kce-border/30"
            style={{width: size, height: size, fontSize: Math.round(size * 0.42)}}
        >
            {initial}
        </div>
    )
}

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
                className="text-xs text-kce-muted hover:text-kce-cream transition-colors leading-none px-1 py-0.5 rounded"
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
    /** Controlled mode: when provided, the built-in toggle button is hidden */
    open?: boolean
    onOpenChange?: (v: boolean) => void
    /** Deep-link: scroll to + flash this specific comment once the thread opens and data loads. */
    highlightCommentId?: number
    onHighlightHandled?: () => void
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
    const {user} = useAppStore()
    const isOwn = comment.created_by_id === user?.id
    const isAdminUser = user?.role === 'admin' || user?.role === 'superadmin'
    const canDelete = isOwn || isAdminUser
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(comment.text ?? '')
    const [editMediaUrl, setEditMediaUrl] = useState<string | null>(comment.media_url)

    const heartReaction = comment.reactions.find(r => r.emoji === '❤️')
    const otherReactions = comment.reactions.filter(r => r.emoji !== '❤️')

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
            onReacted()
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div id={`comment-${comment.id}`} className={depth > 0 ? 'pl-4 border-l-2 border-kce-border/20' : ''}>
            <div className="flex gap-2">
                <Avatar src={comment.created_by_avatar} name={comment.created_by_name} size={28}/>

                <div className="flex-1 min-w-0">
                    {/* Bubble + heart */}
                    <div className="flex items-start gap-1">
                        <div className="flex-1 min-w-0 bg-kce-surface2 rounded-2xl rounded-tl-sm px-3 py-2">
                            <span className="text-xs font-bold text-kce-cream">
                                {comment.created_by_name || t('comment.unknown')}
                            </span>

                            {editing ? (
                                <div className="flex flex-col gap-1.5 mt-1.5">
                                    <div className="flex gap-1.5">
                                        <input
                                            className="kce-input flex-1 py-1"
                                            value={editText}
                                            onChange={e => setEditText(e.target.value)}
                                            autoFocus
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); handleSaveEdit()}
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
                                                onClick={() => {setEditing(false); setEditText(comment.text ?? ''); setEditMediaUrl(comment.media_url)}}>
                                            {t('action.cancel')}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {comment.media_url && (
                                        <img
                                            src={comment.media_url}
                                            alt=""
                                            className="mt-1.5 rounded-xl max-h-48 max-w-full object-contain"
                                        />
                                    )}
                                    {comment.text && (
                                        <p className="text-xs text-kce-cream/90 mt-0.5 leading-relaxed whitespace-pre-wrap">
                                            {comment.text}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Heart reaction — right side, vertically centered */}
                        {!editing && (
                            <button
                                type="button"
                                className="flex flex-col items-center justify-center gap-0.5 self-center px-0.5 flex-shrink-0 min-w-[28px]"
                                onClick={() => handleReaction('❤️')}
                                title={heartReaction?.reacted_by_me ? t('comment.reaction.remove') : t('comment.reaction.add')}
                            >
                                <span className={`text-base leading-none transition-colors ${heartReaction?.reacted_by_me ? 'text-red-400' : 'text-kce-border hover:text-red-400/60'}`}>
                                    {heartReaction?.reacted_by_me ? '❤️' : '🤍'}
                                </span>
                                {heartReaction && heartReaction.count > 0 && (
                                    <span className="text-[9px] text-kce-muted leading-none">{heartReaction.count}</span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Action row */}
                    {!editing && (
                        <div className="flex items-center gap-2.5 mt-1 ml-1 flex-wrap">
                            {comment.created_at && (
                                <span className="text-[10px] text-kce-muted">{fRelTime(comment.created_at)}</span>
                            )}
                            {comment.edited_at && (
                                <span className="text-[10px] text-kce-muted italic">· {t('comment.edited')}</span>
                            )}
                            {/* Show Antworten at any depth — reply always posts flat to the thread */}
                            {onReply && (
                                <button type="button"
                                        className="text-[10px] font-semibold text-kce-muted hover:text-kce-cream transition-colors"
                                        onClick={() => onReply(comment)}>
                                    {t('comment.reply')}
                                </button>
                            )}
                            {isOwn && (
                                <button type="button"
                                        className="text-[10px] text-kce-muted hover:text-kce-cream transition-colors"
                                        onClick={() => {setEditing(true); setEditText(comment.text ?? ''); setEditMediaUrl(comment.media_url)}}
                                        title={t('action.edit')}>
                                    ✏️
                                </button>
                            )}
                            {canDelete && !confirmDelete && (
                                <button type="button"
                                        className="text-[10px] text-kce-muted hover:text-red-400 transition-colors"
                                        onClick={() => setConfirmDelete(true)}
                                        title={t('action.delete')}>
                                    🗑️
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
                            {/* Other emoji reactions as small pills */}
                            {otherReactions.map(r => (
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
                            <ReactionPicker onPick={emoji => handleReaction(emoji)}/>
                        </div>
                    )}
                </div>
            </div>

            {/* Replies — always rendered flat (depth 1 max) */}
            {comment.replies && comment.replies.length > 0 && (
                <div className="mt-2 ml-9 flex flex-col gap-2">
                    {comment.replies.map(reply => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            onDeleted={onDeleted}
                            onReacted={onReacted}
                            onReply={onReply}
                            depth={1}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export function CommentThread({parentType, parentId, open: controlledOpen, onOpenChange, highlightCommentId, onHighlightHandled}: Props) {
    const t = useT()
    const qc = useQueryClient()
    const {user} = useAppStore()
    const isControlled = controlledOpen !== undefined
    const [internalOpen, setInternalOpen] = useState(false)
    const open = isControlled ? (controlledOpen ?? false) : internalOpen
    const setOpen = (v: boolean) => {
        if (isControlled) onOpenChange?.(v)
        else setInternalOpen(v)
    }

    // Auto-open when a specific comment is targeted via deep link (uncontrolled mode)
    useEffect(() => {
        if (highlightCommentId && !isControlled && !internalOpen) setInternalOpen(true)
    }, [highlightCommentId]) // eslint-disable-line react-hooks/exhaustive-deps

    const [text, setText] = useState('')
    const [mediaUrl, setMediaUrl] = useState<string | null>(null)
    const [replyTo, setReplyTo] = useState<Comment | null>(null)
    const [saving, setSaving] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const queryKey = ['comments', parentType, parentId]
    const {data: comments = [], isLoading} = useQuery({
        queryKey,
        queryFn: () => api.listComments(parentType, parentId),
        staleTime: 30000,
    })

    function invalidate() {
        qc.invalidateQueries({queryKey})
    }

    // Scroll to + flash the specific comment once thread is open and data loaded
    const flashedCommentRef = useRef<number | null>(null)
    useEffect(() => {
        if (!highlightCommentId || !open || comments.length === 0) return
        if (flashedCommentRef.current === highlightCommentId) return
        flashedCommentRef.current = highlightCommentId
        onHighlightHandled?.()
        setTimeout(() => {
            const el = document.getElementById(`comment-${highlightCommentId}`)
            if (!el) return
            el.scrollIntoView({behavior: 'smooth', block: 'center'})
            el.classList.add('kce-deeplink-flash')
            setTimeout(() => el.classList.remove('kce-deeplink-flash'), 2500)
        }, 100)
    }, [highlightCommentId, open, comments.length]) // eslint-disable-line react-hooks/exhaustive-deps

    function handleReply(comment: Comment) {
        // Always display the actual comment clicked as reply target
        setReplyTo(comment)
        const name = comment.created_by_name || t('comment.unknown')
        // Set directly (not prepend) to avoid duplicate @handle on repeated clicks
        setText(`@${name} `)
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 150)
    }

    async function handleAdd() {
        if ((!text.trim() && !mediaUrl) || saving) return
        setSaving(true)
        try {
            // parent_comment_id must point to a top-level comment (max depth 1)
            // If replyTo is itself a reply, use its parent as the API parent_comment_id
            const parentCommentId = replyTo
                ? (replyTo.parent_comment_id !== null ? replyTo.parent_comment_id : replyTo.id)
                : undefined
            await api.addComment(parentType, parentId, text.trim(), mediaUrl ?? undefined, parentCommentId)
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
    const canSubmit = (text.trim() || mediaUrl) && !saving

    return (
        <div className="mt-2">
            {/* Built-in toggle — hidden in controlled mode (caller renders it) */}
            {!isControlled && (
                <button
                    type="button"
                    onClick={() => {
                        setOpen(!open)
                        if (!open) setTimeout(() => inputRef.current?.focus(), 150)
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-kce-muted hover:text-kce-cream transition-colors"
                >
                    <span>💬</span>
                    <span>({totalCount})</span>
                    <span className="text-[10px]">{open ? '▲' : '▼'}</span>
                </button>
            )}

            {open && (
                <div className="mt-3 flex flex-col gap-3">
                    {isLoading && (
                        <p className="text-xs text-kce-muted">{t('action.loading')}</p>
                    )}
                    {!isLoading && comments.length === 0 && (
                        <p className="text-xs text-kce-muted italic pl-1">{t('comment.none')}</p>
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
                    <div className="flex flex-col gap-1.5">
                        {replyTo && (
                            <div className="flex items-center gap-1 text-[10px] text-kce-muted pl-9">
                                <span>↩ {t('comment.replyingTo')} <strong className="text-kce-cream/80">{replyTo.created_by_name || t('comment.unknown')}</strong></span>
                                <button type="button" className="hover:text-kce-cream ml-1"
                                        onClick={() => {setReplyTo(null); setText('')}}>×</button>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <Avatar src={user?.avatar ?? null} name={user?.name ?? null} size={28}/>
                            <div className="flex-1 flex items-center bg-kce-surface2 rounded-full border border-kce-border/40 px-3 gap-1.5 min-w-0"
                                 style={{paddingTop: '6px', paddingBottom: '6px'}}>
                                <input
                                    ref={inputRef}
                                    className="flex-1 bg-transparent text-kce-cream outline-none placeholder:text-kce-muted min-w-0"
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
                                    className={`text-sm leading-none transition-colors flex-shrink-0 ${canSubmit ? 'text-kce-primary hover:text-kce-primary/80' : 'text-kce-muted'}`}
                                    disabled={!canSubmit}
                                    onClick={handleAdd}
                                >
                                    ↵
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
