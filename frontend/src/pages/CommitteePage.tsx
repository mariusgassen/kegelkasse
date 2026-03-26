/**
 * CommitteePage — Vergnügungsausschuss: Kegelfahrten und Ankündigungen.
 * Committee members (is_committee) and admins can create/delete entries.
 * All club members can view.
 */
import {useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useHashTab} from '@/hooks/usePage.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {MediaUploadButton} from '@/components/ui/MediaUploadButton.tsx'
import type {ClubAnnouncement, ClubTrip} from '@/types.ts'

function fDate(isoStr: string) {
    const date = isoStr.length > 10 ? isoStr.slice(0, 10) : isoStr
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

function fDateTime(isoStr: string) {
    return new Date(isoStr).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function todayStr() {
    return new Date().toISOString().slice(0, 10)
}

interface DeepLink {
    itemId: number
    commentId: number | null
}

function useDeepLinkScroll(
    items: { id: number }[],
    deepLink: DeepLink | null,
    onHandled: () => void,
    setOpenCommentId: (id: number | null) => void,
    setHighlightCommentId: (id: number | null) => void,
) {
    const highlightRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!deepLink || items.length === 0) return
        const target = items.find(it => it.id === deepLink.itemId)
        if (!target) return

        // Always open the comment thread for the target item
        setOpenCommentId(target.id)
        // Pass comment ID to highlight inside the thread (null if none)
        setHighlightCommentId(deepLink.commentId)
        onHandled()

        if (highlightRef.current !== null) clearTimeout(highlightRef.current)

        highlightRef.current = setTimeout(() => {
            const el = document.getElementById(`item-${target.id}`)
            el?.scrollIntoView({behavior: 'smooth', block: 'center'})
            el?.classList.add('kce-deeplink-flash')
            setTimeout(() => el?.classList.remove('kce-deeplink-flash'), 2500)
        }, 120)
    }, [deepLink, items.length]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Announcements Tab ─────────────────────────────────────────────────────────

function AnnouncementsTab({canWrite, deepLink, onDeepLinkHandled}: {
    canWrite: boolean
    deepLink: DeepLink | null
    onDeepLinkHandled: () => void
}) {
    const t = useT()
    const qc = useQueryClient()
    const [addOpen, setAddOpen] = useState(false)
    const [delId, setDelId] = useState<number | null>(null)
    const [title, setTitle] = useState('')
    const [text, setText] = useState('')
    const [mediaUrl, setMediaUrl] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [openCommentId, setOpenCommentId] = useState<number | null>(null)
    const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null)
    const [search, setSearch] = useState('')

    const {data: announcements = [], isLoading} = useQuery({
        queryKey: ['committee-announcements'],
        queryFn: api.listAnnouncements,
    })

    const sq = search.trim().toLowerCase()
    const filteredAnnouncements = sq
        ? (announcements as ClubAnnouncement[]).filter(a =>
            a.title.toLowerCase().includes(sq) || (a.text ?? '').toLowerCase().includes(sq))
        : announcements as ClubAnnouncement[]

    useDeepLinkScroll(announcements, deepLink, onDeepLinkHandled, setOpenCommentId, setHighlightCommentId)

    async function handleCreate() {
        if (!title.trim()) return
        setSaving(true)
        try {
            await api.createAnnouncement({title: title.trim(), text: text.trim() || undefined, media_url: mediaUrl || undefined})
            await qc.invalidateQueries({queryKey: ['committee-announcements']})
            setAddOpen(false)
            setTitle('')
            setText('')
            setMediaUrl(null)
            showToast('✓ Ankündigung veröffentlicht')
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: number) {
        try {
            await api.deleteAnnouncement(id)
            await qc.invalidateQueries({queryKey: ['committee-announcements']})
            setDelId(null)
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div>
            {canWrite && (
                <button className="btn-primary w-full mb-4" onClick={() => setAddOpen(true)}>
                    + {t('committee.announcement.add')}
                </button>
            )}

            <input
                className="kce-input mb-3"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('committee.search')}
            />

            {isLoading && <p className="text-kce-muted text-sm text-center py-8">{t('action.loading')}</p>}

            {!isLoading && filteredAnnouncements.length === 0 && (
                <Empty icon="📣" text={t('committee.announcement.none')}/>
            )}

            <div className="flex flex-col gap-3">
                {filteredAnnouncements.map((a: ClubAnnouncement) => (
                    <div key={a.id} id={`item-${a.id}`} className="kce-card p-4">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-kce-cream text-sm leading-snug">{a.title}</p>
                                {a.media_url && (
                                    <img
                                        src={a.media_url}
                                        alt=""
                                        className="mt-2 rounded max-h-64 max-w-full object-contain border border-kce-border/40"
                                    />
                                )}
                                {a.text && (
                                    <p className="text-kce-muted text-xs mt-1 whitespace-pre-wrap leading-relaxed">
                                        {a.text}
                                    </p>
                                )}
                                <p className="text-[10px] text-kce-muted mt-2">
                                    {a.created_by_name && (
                                        <span>{t('committee.announcement.by')} {a.created_by_name} · </span>
                                    )}
                                    {a.created_at && fDateTime(a.created_at)}
                                </p>
                            </div>
                            {canWrite && (
                                <button
                                    className="text-kce-muted hover:text-red-400 text-lg leading-none flex-shrink-0 mt-0.5"
                                    onClick={() => setDelId(a.id)}>
                                    ×
                                </button>
                            )}
                        </div>
                        <ItemReactionBar
                            parentType="announcement" parentId={a.id}
                            commentOpen={openCommentId === a.id}
                            onCommentToggle={() => setOpenCommentId(openCommentId === a.id ? null : a.id)}
                        />
                        <CommentThread
                            parentType="announcement" parentId={a.id}
                            open={openCommentId === a.id}
                            onOpenChange={v => setOpenCommentId(v ? a.id : null)}
                            highlightCommentId={openCommentId === a.id ? (highlightCommentId ?? undefined) : undefined}
                            onHighlightHandled={() => setHighlightCommentId(null)}
                        />
                    </div>
                ))}
            </div>

            {/* Add sheet */}
            {addOpen && (
                <Sheet open onClose={() => setAddOpen(false)} title={t('committee.announcement.new')}
                       onSubmit={handleCreate}>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="field-label">{t('committee.announcement.title')}</label>
                            <input
                                className="kce-input"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={t('committee.announcement.title')}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="field-label">{t('committee.announcement.text')}</label>
                            <textarea
                                className="kce-input resize-none"
                                rows={4}
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder={t('committee.announcement.text')}
                            />
                        </div>
                        <div>
                            <label className="field-label">{t('media.attach')}</label>
                            <MediaUploadButton
                                value={mediaUrl}
                                onUploaded={setMediaUrl}
                                onRemove={() => setMediaUrl(null)}
                            />
                        </div>
                        <button type="submit" className="btn-primary w-full" disabled={!title.trim() || saving}>
                            {saving ? t('action.saving') : t('action.save')}
                        </button>
                    </div>
                </Sheet>
            )}

            {/* Delete confirm */}
            {delId !== null && (
                <Sheet open onClose={() => setDelId(null)} title={t('action.delete')}>
                    <div className="flex flex-col gap-3">
                        <p className="text-kce-muted text-sm">{t('committee.announcement.deleteConfirm')}</p>
                        <button className="btn-primary w-full" style={{background: '#c0392b'}}
                                onClick={() => handleDelete(delId)}>
                            {t('action.confirmDelete')}
                        </button>
                    </div>
                </Sheet>
            )}
        </div>
    )
}

// ── Trips Tab (Kegelfahrten) ──────────────────────────────────────────────────

function TripsTab({canWrite, deepLink, onDeepLinkHandled}: {
    canWrite: boolean
    deepLink: DeepLink | null
    onDeepLinkHandled: () => void
}) {
    const t = useT()
    const qc = useQueryClient()
    const [addOpen, setAddOpen] = useState(false)
    const [editTrip, setEditTrip] = useState<ClubTrip | null>(null)
    const [delId, setDelId] = useState<number | null>(null)
    const [openCommentTripId, setOpenCommentTripId] = useState<number | null>(null)
    const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null)
    const [date, setDate] = useState(todayStr())
    const [destination, setDestination] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    const {data: trips = [], isLoading} = useQuery({
        queryKey: ['committee-trips'],
        queryFn: api.listTrips,
    })

    useDeepLinkScroll(trips, deepLink, onDeepLinkHandled, setOpenCommentTripId, setHighlightCommentId)

    function openEdit(trip: ClubTrip) {
        setEditTrip(trip)
        setDate(trip.date.slice(0, 10))
        setDestination(trip.destination)
        setNote(trip.note || '')
    }

    function resetForm() {
        setDate(todayStr())
        setDestination('')
        setNote('')
        setEditTrip(null)
        setAddOpen(false)
    }

    async function handleCreate() {
        if (!destination.trim()) return
        setSaving(true)
        try {
            await api.createTrip({date, destination: destination.trim(), note: note.trim() || undefined})
            await qc.invalidateQueries({queryKey: ['committee-trips']})
            resetForm()
            showToast('✓ Kegelfahrt eingetragen')
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function handleUpdate() {
        if (!editTrip || !destination.trim()) return
        setSaving(true)
        try {
            await api.updateTrip(editTrip.id, {date, destination: destination.trim(), note: note.trim() || undefined})
            await qc.invalidateQueries({queryKey: ['committee-trips']})
            resetForm()
            showToast(t('club.savedOk'))
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: number) {
        try {
            await api.deleteTrip(id)
            await qc.invalidateQueries({queryKey: ['committee-trips']})
            setDelId(null)
        } catch (e) {
            toastError(e)
        }
    }

    const now = new Date()
    const tq = search.trim().toLowerCase()
    const filteredTrips = tq
        ? (trips as ClubTrip[]).filter(tr =>
            tr.destination.toLowerCase().includes(tq) || (tr.note ?? '').toLowerCase().includes(tq))
        : trips as ClubTrip[]
    const upcoming = filteredTrips.filter((tr: ClubTrip) => new Date(tr.date + 'Z') >= now)
    const past = filteredTrips.filter((tr: ClubTrip) => new Date(tr.date + 'Z') < now)

    return (
        <div>
            {canWrite && (
                <button className="btn-primary w-full mb-4" onClick={() => setAddOpen(true)}>
                    + {t('committee.trip.add')}
                </button>
            )}

            <input
                className="kce-input mb-3"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('committee.search')}
            />

            {isLoading && <p className="text-kce-muted text-sm text-center py-8">{t('action.loading')}</p>}

            {!isLoading && filteredTrips.length === 0 && (
                <Empty icon="🚌" text={t('committee.trip.none')}/>
            )}

            {upcoming.length > 0 && (
                <>
                    <p className="sec-heading mb-2">{t('schedule.upcoming')}</p>
                    <div className="flex flex-col gap-3 mb-5">
                        {upcoming.map((tr: ClubTrip) => (
                            <TripCard key={tr.id} trip={tr} canWrite={canWrite}
                                      commentOpen={openCommentTripId === tr.id}
                                      highlightCommentId={openCommentTripId === tr.id ? (highlightCommentId ?? undefined) : undefined}
                                      onCommentToggle={() => setOpenCommentTripId(openCommentTripId === tr.id ? null : tr.id)}
                                      onCommentClose={() => setOpenCommentTripId(null)}
                                      onHighlightHandled={() => setHighlightCommentId(null)}
                                      onEdit={() => openEdit(tr)}
                                      onDelete={() => setDelId(tr.id)}/>
                        ))}
                    </div>
                </>
            )}

            {past.length > 0 && (
                <>
                    <p className="sec-heading mb-2">{t('schedule.past')}</p>
                    <div className="flex flex-col gap-3">
                        {[...past].reverse().map((tr: ClubTrip) => (
                            <TripCard key={tr.id} trip={tr} canWrite={canWrite} past
                                      commentOpen={openCommentTripId === tr.id}
                                      highlightCommentId={openCommentTripId === tr.id ? (highlightCommentId ?? undefined) : undefined}
                                      onCommentToggle={() => setOpenCommentTripId(openCommentTripId === tr.id ? null : tr.id)}
                                      onCommentClose={() => setOpenCommentTripId(null)}
                                      onHighlightHandled={() => setHighlightCommentId(null)}
                                      onEdit={() => openEdit(tr)}
                                      onDelete={() => setDelId(tr.id)}/>
                        ))}
                    </div>
                </>
            )}

            {/* Add sheet */}
            {addOpen && (
                <Sheet open onClose={resetForm} title={t('committee.trip.new')} onSubmit={handleCreate}>
                    <div className="flex flex-col gap-3">
                        <TripFormFields date={date} destination={destination} note={note}
                                        onDate={setDate} onDestination={setDestination} onNote={setNote}/>
                        <button type="submit" className="btn-primary w-full" disabled={!destination.trim() || saving}>
                            {saving ? t('action.saving') : t('action.save')}
                        </button>
                    </div>
                </Sheet>
            )}

            {/* Edit sheet */}
            {editTrip && (
                <Sheet open onClose={resetForm} title={t('committee.trip.edit')} onSubmit={handleUpdate}>
                    <div className="flex flex-col gap-3">
                        <TripFormFields date={date} destination={destination} note={note}
                                        onDate={setDate} onDestination={setDestination} onNote={setNote}/>
                        <button type="submit" className="btn-primary w-full" disabled={!destination.trim() || saving}>
                            {saving ? t('action.saving') : t('action.save')}
                        </button>
                    </div>
                </Sheet>
            )}

            {/* Delete confirm */}
            {delId !== null && (
                <Sheet open onClose={() => setDelId(null)} title={t('action.delete')}>
                    <div className="flex flex-col gap-3">
                        <p className="text-kce-muted text-sm">{t('committee.trip.deleteConfirm')}</p>
                        <button className="btn-primary w-full" style={{background: '#c0392b'}}
                                onClick={() => handleDelete(delId)}>
                            {t('action.confirmDelete')}
                        </button>
                    </div>
                </Sheet>
            )}
        </div>
    )
}

function TripFormFields({date, destination, note, onDate, onDestination, onNote}: {
    date: string
    destination: string
    note: string
    onDate: (v: string) => void
    onDestination: (v: string) => void
    onNote: (v: string) => void
}) {
    const t = useT()
    return (
        <>
            <div>
                <label className="field-label">{t('committee.trip.date')}</label>
                <input type="date" className="kce-input" value={date} onChange={e => onDate(e.target.value)}/>
            </div>
            <div>
                <label className="field-label">{t('committee.trip.destination')}</label>
                <input
                    className="kce-input"
                    value={destination}
                    onChange={e => onDestination(e.target.value)}
                    placeholder={t('committee.trip.destinationPlaceholder')}
                    autoFocus
                />
            </div>
            <div>
                <label className="field-label">{t('committee.trip.note')}</label>
                <textarea
                    className="kce-input resize-none"
                    rows={3}
                    value={note}
                    onChange={e => onNote(e.target.value)}
                    placeholder={t('common.optional')}
                />
            </div>
        </>
    )
}

function TripCard({trip, canWrite, past = false, commentOpen, highlightCommentId, onCommentToggle, onCommentClose, onHighlightHandled, onEdit, onDelete}: {
    trip: ClubTrip
    canWrite: boolean
    past?: boolean
    commentOpen?: boolean
    highlightCommentId?: number
    onCommentToggle?: () => void
    onCommentClose?: () => void
    onHighlightHandled?: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    return (
        <div id={`item-${trip.id}`} className={`kce-card p-4 ${past ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🚌</span>
                        <p className="font-bold text-kce-cream text-sm leading-snug">{trip.destination}</p>
                    </div>
                    <p className="text-xs text-kce-amber font-bold">{fDate(trip.date)}</p>
                    {trip.note && (
                        <p className="text-kce-muted text-xs mt-1 whitespace-pre-wrap">{trip.note}</p>
                    )}
                    {trip.created_by_name && (
                        <p className="text-[10px] text-kce-muted mt-1.5">von {trip.created_by_name}</p>
                    )}
                </div>
                {canWrite && (
                    <div className="flex gap-1 flex-shrink-0">
                        <button
                            className="text-kce-muted hover:text-kce-amber text-xs px-2 py-1 rounded"
                            onClick={onEdit}>
                            ✏️
                        </button>
                        <button
                            className="text-kce-muted hover:text-red-400 text-lg leading-none px-1"
                            onClick={onDelete}>
                            ×
                        </button>
                    </div>
                )}
            </div>
            <ItemReactionBar
                parentType="trip" parentId={trip.id}
                commentOpen={commentOpen}
                onCommentToggle={onCommentToggle}
            />
            <CommentThread
                parentType="trip" parentId={trip.id}
                open={commentOpen}
                onOpenChange={v => v ? onCommentToggle?.() : onCommentClose?.()}
                highlightCommentId={commentOpen ? highlightCommentId : undefined}
                onHighlightHandled={onHighlightHandled}
            />
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CommitteePage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const regularMembers = useAppStore(s => s.regularMembers)
    const [tab, setTab] = useHashTab<'announcements' | 'trips'>('announcements', ['announcements', 'trips'])
    const [deepLink, setDeepLink] = useState<DeepLink | null>(null)
    const [hashVersion, setHashVersion] = useState(0)

    // User can write if they are admin OR their regular member has is_committee=true
    const myMember = regularMembers.find(m => m.id === user?.regular_member_id)
    const canWrite = isAdmin(user) || !!myMember?.is_committee

    // Listen for hash changes triggered by notification-panel clicks
    useEffect(() => {
        const handler = () => setHashVersion(v => v + 1)
        window.addEventListener('hashchange', handler)
        return () => window.removeEventListener('hashchange', handler)
    }, [])

    // Parse deep-link params from hash (on mount and whenever hash changes)
    useEffect(() => {
        const params = getHashParams()
        const itemId = params.get('item')
        if (!itemId) return
        const commentId = params.get('comment')
        setDeepLink({
            itemId: parseInt(itemId, 10),
            commentId: commentId ? parseInt(commentId, 10) : null,
        })
        clearHashParams()
    }, [hashVersion])

    const TABS = [
        {id: 'announcements', label: t('committee.tab.announcements')},
        {id: 'trips', label: t('committee.tab.trips')},
    ]

    return (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
            {/* Header */}
            <div className="flex-shrink-0 px-3 pt-3 pb-0">
                <div className="flex items-center justify-between mb-2">
                    <div className="sec-heading">{t('committee.title')}</div>
                    {canWrite && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                              style={{background: 'rgba(232,160,32,.15)', color: '#e8a020', border: '1px solid #c4701a'}}>
                            VGA
                        </span>
                    )}
                </div>
                <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                    {TABS.map(tb => (
                        <button key={tb.id} type="button"
                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                onClick={() => setTab(tb.id as any)}>{tb.label}</button>
                    ))}
                </div>
            </div>

            <div className="page-scroll px-3 pb-24">
                {tab === 'announcements' && (
                    <AnnouncementsTab
                        canWrite={canWrite}
                        deepLink={deepLink}
                        onDeepLinkHandled={() => setDeepLink(null)}
                    />
                )}
                {tab === 'trips' && (
                    <TripsTab
                        canWrite={canWrite}
                        deepLink={deepLink}
                        onDeepLinkHandled={() => setDeepLink(null)}
                    />
                )}
            </div>
        </div>
    )
}
