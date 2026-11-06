/**
 * StickersPage — the sticker wall. Members post photos of club stickers put up on trips and
 * holidays together with where they are; the feed lists the posts, the map shows every place
 * the club has left a sticker.
 */
import {lazy, Suspense, useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {MapPin} from 'lucide-react'
import {useHashTab} from '@/hooks/usePage.ts'
import {useDeepLinkVersion, flashDeepLinkTarget} from '@/hooks/useDeepLink.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {useT, useI18n} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {SkeletonCard} from '@/components/ui/Skeleton'
import {showToast} from '@/components/ui/Toast.tsx'
import {PhotoPicker, type Photo} from '@/components/stickers/PhotoPicker.tsx'
import {PhotoGallery} from '@/components/stickers/PhotoGallery.tsx'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {toastError} from '@/utils/error.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {readFileExif} from '@/lib/exifGps.ts'
import {reverseGeocode} from '@/lib/geocode.ts'
import {placeCount} from '@/lib/stickers.ts'
import {todayDateInput} from '@/lib/datetime.ts'
import type {Sticker} from '@/types.ts'
import type {LatLng} from '@/components/stickers/StickerMap.tsx'

// Leaflet is ~150 KB; only fetch it when the map or the location picker is actually shown.
const StickerMap = lazy(() => import('@/components/stickers/StickerMap.tsx'))

function fDay(day: string, locale: string) {
    return new Date(`${day}T00:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE',
        {day: '2-digit', month: 'long', year: 'numeric'})
}

function MapBox({online, children}: { online: boolean; children: React.ReactNode }) {
    const t = useT()
    if (!online) return <p className="text-sm text-muted py-6 text-center">{t('stickers.map.offline')}</p>
    return <Suspense fallback={<SkeletonCard/>}>{children}</Suspense>
}

// ── Post / edit form ──────────────────────────────────────────────────────────

function StickerForm({sticker, onClose, onSaved}: {
    sticker: Sticker | null
    onClose: () => void
    onSaved: () => void
}) {
    const t = useT()
    const online = useOnline()
    const [photos, setPhotos] = useState<Photo[]>(sticker?.media_urls.map(url => ({url})) ?? [])
    const [place, setPlace] = useState(sticker?.place_name ?? '')
    const [caption, setCaption] = useState(sticker?.caption ?? '')
    const [day, setDay] = useState(sticker?.stuck_on ?? '')
    const [pos, setPos] = useState<LatLng | null>(
        sticker ? {latitude: sticker.latitude, longitude: sticker.longitude} : null)
    const [fromPhoto, setFromPhoto] = useState(false)
    const [showMap, setShowMap] = useState(false)
    const [saving, setSaving] = useState(false)
    const locale = useI18n(st => st.locale)
    // The latest typed place, readable from async prefill callbacks: a lookup that finishes late must
    // never overwrite what the member typed in the meantime.
    const placeRef = useRef(place)
    placeRef.current = place
    const posRef = useRef(pos)
    posRef.current = pos

    async function prefillPlace(p: LatLng) {
        const label = await reverseGeocode(p.latitude, p.longitude, locale)
        if (label && !placeRef.current.trim()) setPlace(label)
    }

    function setPin(p: LatLng, photo: boolean) {
        posRef.current = p
        setPos(p)
        setFromPhoto(photo)
        void prefillPlace(p)
    }

    async function handleFiles(files: File[]) {
        // Everything is only a suggestion: it fills empty fields and never replaces a pin, place or
        // date the member has already set. The first photo that knows something wins.
        for (const file of files) {
            const meta = await readFileExif(file).catch(() => null)
            if (!meta) continue
            if (meta.takenOn && meta.takenOn <= todayDateInput()) setDay(cur => cur || meta.takenOn!)
            if (meta.gps && !posRef.current) setPin(meta.gps, true)
            else if (meta.gps) void prefillPlace(meta.gps)
        }
    }

    function useMyLocation() {
        if (!navigator.geolocation) { showToast(t('stickers.form.locationDenied'), 'error'); return }
        navigator.geolocation.getCurrentPosition(
            p => setPin({latitude: p.coords.latitude, longitude: p.coords.longitude}, false),
            () => showToast(t('stickers.form.locationDenied'), 'error'),
            {enableHighAccuracy: true, timeout: 10000},
        )
    }

    const canSave = photos.length > 0 && !!place.trim() && !!pos && !saving

    async function save() {
        if (!photos.length || !pos) { showToast(t('stickers.form.needLocation'), 'error'); return }
        setSaving(true)
        try {
            const body = {
                media_urls: photos.map(p => p.url), place_name: place.trim(), latitude: pos.latitude, longitude: pos.longitude,
                caption: caption.trim(), stuck_on: day,
            }
            if (sticker) await api.updateSticker(sticker.id, body)
            else await api.createSticker(body)
            showToast(t('stickers.saved'))
            onSaved()
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open onClose={onClose} onSubmit={save}
               title={t(sticker ? 'stickers.form.edit' : 'stickers.form.new')}>
            <div className="flex flex-col gap-3">
                <PhotoPicker photos={photos} onChange={setPhotos} onFiles={handleFiles}/>
                {photos.length > 0 && (<>
                    <div>
                        <label className="field-label" htmlFor="sticker-place">{t('stickers.form.place')}</label>
                        <input id="sticker-place" className="kce-input" value={place} maxLength={120}
                               onChange={e => setPlace(e.target.value)} placeholder={t('stickers.form.placeHint')}/>
                    </div>
                    <div>
                        <label className="field-label">{t('stickers.form.location')}</label>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm flex items-center gap-1 ${pos ? 'text-ink' : 'text-muted'}`}>
                                <MapPin size={16} aria-hidden="true"/>
                                {!pos ? t('stickers.form.locationHint') : fromPhoto ? t('stickers.form.fromPhoto') : t('stickers.form.pinSet')}
                            </span>
                            {pos && !showMap && (
                                <button type="button" className="btn-secondary btn-xs" onClick={() => setShowMap(true)}>
                                    {t('stickers.form.adjustPin')}
                                </button>
                            )}
                            <button type="button" className="btn-secondary btn-xs" onClick={useMyLocation}>
                                {t('stickers.form.useMyLocation')}
                            </button>
                        </div>
                        {/* The map is only needed when the photo carried no position, or to fine-tune it:
                            keeping it folded keeps the dialog short instead of a long scrolling form. */}
                        {(showMap || !pos) && (
                            <div className="mt-2">
                                <MapBox online={online}>
                                    <StickerMap picked={pos} onPick={p => setPin(p, false)}
                                                attribution={t('stickers.map.attribution')}
                                                className="w-full h-56 rounded-xl overflow-hidden border border-line"/>
                                </MapBox>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="field-label" htmlFor="sticker-day">{t('stickers.form.date')}</label>
                        <input id="sticker-day" type="date" className="kce-input" value={day} max={todayDateInput()}
                               onChange={e => setDay(e.target.value)}/>
                    </div>
                    <div>
                        <label className="field-label" htmlFor="sticker-caption">{t('stickers.form.caption')}</label>
                        <textarea id="sticker-caption" className="kce-input resize-none" rows={2} maxLength={1000}
                                  value={caption} onChange={e => setCaption(e.target.value)}/>
                    </div>
                </>)}
                <button type="submit" className="btn-primary w-full" disabled={!canSave}>
                    {saving ? t('action.saving') : t('action.save')}
                </button>
            </div>
        </Sheet>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function StickersPage() {
    const t = useT()
    const qc = useQueryClient()
    const locale = useI18n(s => s.locale)
    const online = useOnline()
    const [tab, setTab] = useHashTab<'feed' | 'map'>('feed', ['feed', 'map'])
    const [form, setForm] = useState<Sticker | 'new' | null>(null)
    const [delId, setDelId] = useState<number | null>(null)
    const [openComment, setOpenComment] = useState<number | null>(null)
    const [highlightComment, setHighlightComment] = useState<number | null>(null)
    const [target, setTarget] = useState<number | null>(null)
    const hashVersion = useDeepLinkVersion()

    const {data: stickers = [], isLoading} = useQuery({queryKey: ['stickers'], queryFn: api.listStickers})

    // Deep link (`?item=ID[&comment=ID]`, from comment notifications and the map popup).
    useEffect(() => {
        const params = getHashParams()
        const item = params.get('item')
        if (!item) return
        const comment = params.get('comment')
        setTarget(parseInt(item, 10))
        setHighlightComment(comment ? parseInt(comment, 10) : null)
        clearHashParams()
    }, [hashVersion])

    useEffect(() => {
        if (target === null || tab !== 'feed' || !stickers.some(s => s.id === target)) return
        setOpenComment(highlightComment !== null ? target : null)
        const stop = flashDeepLinkTarget(`sticker-${target}`)
        setTarget(null)
        return stop
    }, [target, tab, stickers]) // eslint-disable-line react-hooks/exhaustive-deps

    async function refresh() { await qc.invalidateQueries({queryKey: ['stickers']}) }

    async function handleDelete(id: number) {
        try {
            await api.deleteSticker(id)
            await refresh()
            setDelId(null)
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
            <div className="flex-shrink-0 px-3 pt-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="sec-heading">{t('stickers.title')}</div>
                    <button type="button" className="btn-primary btn-xs" onClick={() => setForm('new')}>
                        + {t('stickers.add')}
                    </button>
                </div>
                <ModeToggle value={tab} onChange={v => setTab(v as 'feed' | 'map')}
                            options={[{value: 'feed', label: t('stickers.view.feed')},
                                      {value: 'map', label: t('stickers.view.map')}]}/>
                {stickers.length > 0 && (
                    <p className="text-sm text-muted mb-2">
                        {t('stickers.count').replace('{n}', String(stickers.length))
                            .replace('{p}', String(placeCount(stickers)))}
                    </p>
                )}
            </div>

            <div className="page-scroll px-3 pb-24">
                {isLoading && <SkeletonCard className="mb-2"/>}
                {!isLoading && stickers.length === 0 && <Empty icon="🏷️" text={t('stickers.none')}/>}

                {tab === 'map' && stickers.length > 0 && (
                    <MapBox online={online}>
                        <StickerMap stickers={stickers} attribution={t('stickers.map.attribution')}
                                    openLabel={t('stickers.map.open')}
                                    className="w-full h-[60vh] rounded-xl overflow-hidden border border-line"
                                    onOpen={id => { setTarget(id); setTab('feed') }}/>
                    </MapBox>
                )}

                {tab === 'feed' && (
                    <div className="flex flex-col gap-3">
                        {stickers.map(s => (
                            <div key={s.id} id={`sticker-${s.id}`} className="kce-card p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-ink text-sm leading-snug flex items-center gap-1">
                                            <MapPin size={16} aria-hidden="true" className="flex-shrink-0"/>
                                            <span className="truncate">{s.place_name}</span>
                                        </p>
                                        <p className="text-xs text-muted mt-0.5">
                                            {s.stuck_on && <span>{t('stickers.stuckOn')} {fDay(s.stuck_on, locale)} · </span>}
                                            {s.created_by_name && <span>{t('stickers.by')} {s.created_by_name}</span>}
                                        </p>
                                    </div>
                                    {s.can_edit && (
                                        <CardActionMenu
                                            title={s.place_name}
                                            actions={[
                                                {icon: '✏️', label: t('action.edit'), onClick: () => setForm(s)},
                                                {icon: '🗑️', label: t('action.delete'), danger: true,
                                                    onClick: () => setDelId(s.id)},
                                            ]}
                                        />
                                    )}
                                </div>
                                <PhotoGallery urls={s.media_urls}/>
                                {s.caption && <p className="text-sm text-ink mt-2 whitespace-pre-wrap">{s.caption}</p>}
                                <ItemReactionBar
                                    parentType="sticker" parentId={s.id}
                                    commentOpen={openComment === s.id}
                                    onCommentToggle={() => setOpenComment(openComment === s.id ? null : s.id)}/>
                                <CommentThread
                                    parentType="sticker" parentId={s.id}
                                    open={openComment === s.id}
                                    onOpenChange={v => setOpenComment(v ? s.id : null)}
                                    highlightCommentId={openComment === s.id ? (highlightComment ?? undefined) : undefined}
                                    onHighlightHandled={() => setHighlightComment(null)}/>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {form !== null && (
                <StickerForm sticker={form === 'new' ? null : form} onClose={() => setForm(null)}
                             onSaved={async () => { setForm(null); await refresh() }}/>
            )}

            {delId !== null && (
                <Sheet open onClose={() => setDelId(null)} title={t('action.delete')}>
                    <div className="flex flex-col gap-3">
                        <p className="text-muted text-sm">{t('stickers.deleteConfirm')}</p>
                        <button type="button" className="btn-danger w-full" onClick={() => handleDelete(delId)}>
                            {t('action.confirmDelete')}
                        </button>
                    </div>
                </Sheet>
            )}
        </div>
    )
}
