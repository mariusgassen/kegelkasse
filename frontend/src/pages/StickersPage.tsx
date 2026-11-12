/**
 * StickersPage — the sticker wall. Members post photos of club stickers put up on trips and
 * holidays together with where they are; the feed lists the posts, the map shows every place
 * the club has left a sticker.
 */
import {lazy, Suspense, useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {MapPin, Plus, Search} from 'lucide-react'
import {useHashTab} from '@/hooks/usePage.ts'
import {useDeepLinkVersion, flashDeepLinkTarget} from '@/hooks/useDeepLink.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {useT, useI18n} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {SearchInput} from '@/components/ui/SearchInput.tsx'
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
import {placeCount, matchesSticker, posterNames} from '@/lib/stickers.ts'
import {todayDateInput} from '@/lib/datetime.ts'
import {useAppStore} from '@/store/app.ts'
import {useClub} from '@/hooks/useClub.ts'
import type {MapStyle, Sticker} from '@/types.ts'
import type {LatLng} from '@/components/stickers/StickerMap.tsx'
import {Button} from '@/components/ui/Button.tsx'

// Leaflet is ~150 KB; only fetch it when the map or the location picker is actually shown.
const StickerMap = lazy(() => import('@/components/stickers/StickerMap.tsx'))

function fDay(day: string, locale: string) {
    return new Date(`${day}T00:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE',
        {day: '2-digit', month: 'long', year: 'numeric'})
}

function MapBox({online, className, children}: { online: boolean; className?: string; children: React.ReactNode }) {
    const t = useT()
    if (!online) return <Empty text={t('stickers.map.offline')}/>
    return (
        <div data-no-ptr className={className ?? "w-full"}>
            <Suspense fallback={<SkeletonCard className="w-full h-full flex-1"/>}>
                {children}
            </Suspense>
        </div>
    )
}

// ── Post / edit form ──────────────────────────────────────────────────────────

function StickerForm({sticker, mapStyle, onClose, onSaved}: {
    sticker: Sticker | null
    mapStyle?: MapStyle | string
    onClose: () => void
    onSaved: () => void
}) {
    const t = useT()
    const online = useOnline()
    const [photos, setPhotos] = useState<Photo[]>(sticker?.media_urls.map(url => ({url})) ?? [])
    const [sel, setSel] = useState(0)
    const [place, setPlace] = useState(sticker?.place_name ?? '')
    const [caption, setCaption] = useState(sticker?.caption ?? '')
    const [day, setDay] = useState(sticker?.stuck_on ?? '')
    const [pos, setPos] = useState<LatLng | null>(
        sticker ? {latitude: sticker.latitude, longitude: sticker.longitude} : null)
    const [fromPhoto, setFromPhoto] = useState(false)
    // 'one' = a single post carrying every photo; 'split' = one post per photo from the same pick.
    const [mode, setMode] = useState<'one' | 'split'>('one')
    const [showMap, setShowMap] = useState(false)
    const [saving, setSaving] = useState(false)
    const locale = useI18n(st => st.locale)
    // The latest typed place, readable from async prefill callbacks: a lookup that finishes late must
    // never overwrite what the member typed in the meantime.
    const placeRef = useRef(place)
    placeRef.current = place
    const posRef = useRef(pos)
    posRef.current = pos
    const exifCache = useRef(new Map<File, Promise<{gps: LatLng | null; takenOn: string | null} | null>>())
    const seenFiles = useRef(new Set<File>())

    function getExif(file: File) {
        let p = exifCache.current.get(file)
        if (!p) {
            p = readFileExif(file).catch(() => null)
            exifCache.current.set(file, p)
        }
        return p
    }

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
            const meta = await getExif(file)
            if (!meta) continue
            if (meta.takenOn && meta.takenOn <= todayDateInput()) setDay(cur => cur || meta.takenOn!)
            if (meta.gps && !posRef.current) setPin(meta.gps, true)
        }
    }

    // Resolve each picked photo's own EXIF GPS, date and reverse-geocoded place so stepping through
    // pictures in "One post per photo" mode shows the determined place and pin per sticker.
    useEffect(() => {
        photos.forEach(p => {
            const file = p.file
            if (!file || seenFiles.current.has(file)) return
            seenFiles.current.add(file)
            void (async () => {
                const meta = await getExif(file)
                if (!meta) return
                const validTaken = meta.takenOn && meta.takenOn <= todayDateInput() ? meta.takenOn : ''
                if (validTaken) setDay(cur => cur || validTaken)
                if (meta.gps && !posRef.current) setPin(meta.gps, true)
                const label = meta.gps ? await reverseGeocode(meta.gps.latitude, meta.gps.longitude, locale) : null
                setPhotos(prev => prev.map(item => item.file === file ? {
                    ...item,
                    gps: item.gps ?? meta.gps ?? null,
                    takenOn: item.takenOn ?? (validTaken || undefined),
                    fromPhoto: item.fromPhoto ?? !!meta.gps,
                    place: item.place ?? (label ?? undefined),
                } : item))
            })()
        })
    }, [photos, locale]) // eslint-disable-line react-hooks/exhaustive-deps

    const split = !sticker && photos.length > 1 && mode === 'split'
    const idx = Math.min(sel, Math.max(0, photos.length - 1))
    const cur = photos[idx]
    const shownPlace = split ? (cur?.place ?? '') : place
    const shownPos = split ? (cur?.gps ?? null) : pos
    const shownFromPhoto = split ? (cur?.fromPhoto ?? false) : fromPhoto
    const shownDay = split ? (cur?.takenOn ?? '') : day

    function updateCurrentPhoto(patch: Partial<Photo>) {
        setPhotos(prev => prev.map((p, k) => k === idx ? {...p, ...patch} : p))
    }

    async function setPinForCurrent(p: LatLng, photo: boolean) {
        if (!split) {
            setPin(p, photo)
            return
        }
        updateCurrentPhoto({gps: p, fromPhoto: photo})
        const label = await reverseGeocode(p.latitude, p.longitude, locale)
        if (label) {
            setPhotos(prev => prev.map((item, k) => k === idx && !item.place?.trim() ? {...item, place: label} : item))
        }
    }

    function useMyLocation() {
        if (!navigator.geolocation) { showToast(t('stickers.form.locationDenied'), 'error'); return }
        navigator.geolocation.getCurrentPosition(
            p => { void setPinForCurrent({latitude: p.coords.latitude, longitude: p.coords.longitude}, false) },
            () => showToast(t('stickers.form.locationDenied'), 'error'),
            {enableHighAccuracy: true, timeout: 10000},
        )
    }

    // In split mode place/pin/date come from each photo's own data; the fields below are the fallback.
    const canSave = photos.length > 0 && (split || (!!place.trim() && !!pos)) && !saving

    /** One post per photo: each takes its own EXIF position/date/place, else the form's values. */
    async function saveSplit() {
        const posts = []
        for (let i = 0; i < photos.length; i++) {
            const p = photos[i]
            const meta = p.gps !== undefined ? {gps: p.gps, takenOn: p.takenOn ?? null}
                : (p.file ? await getExif(p.file) : null)
            const at = p.gps ?? meta?.gps ?? pos
            const label = (p.place?.trim()) || (at
                ? (await reverseGeocode(at.latitude, at.longitude, locale)) ?? place.trim()
                : place.trim())
            if (!at || !label) {
                setSel(i)
                showToast(t('stickers.form.needLocationEach'), 'error')
                return false
            }
            const rawTaken = p.takenOn ?? meta?.takenOn ?? ''
            const taken = rawTaken && rawTaken <= todayDateInput() ? rawTaken : ''
            posts.push({media_urls: [p.url], place_name: label, latitude: at.latitude, longitude: at.longitude,
                caption: caption.trim(), stuck_on: taken || day})
        }
        for (const body of posts) await api.createSticker(body)
        return true
    }

    async function save() {
        if (!canSave) { showToast(t('stickers.form.needLocation'), 'error'); return }
        setSaving(true)
        try {
            if (split) {
                if (await saveSplit()) { showToast(t('stickers.savedMany').replace('{n}', String(photos.length))); onSaved() }
                return
            }
            if (!pos) return
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
                <PhotoPicker photos={photos} onChange={setPhotos} onFiles={handleFiles}
                             selected={sel} onSelect={setSel}/>
                {!sticker && photos.length > 1 && (
                    <div role="group" aria-label={t('stickers.form.mode')} className="flex flex-col gap-1">
                        <div className="flex gap-2">
                            <button type="button" className={mode === 'one' ? 'chip active' : 'chip'} aria-pressed={mode === 'one'}
                                     onClick={() => setMode('one')}>{t('stickers.form.modeOne')}</button>
                            <button type="button" className={mode === 'split' ? 'chip active' : 'chip'} aria-pressed={mode === 'split'}
                                     onClick={() => setMode('split')}>{t('stickers.form.modeSplit')}</button>
                        </div>
                        {mode === 'split' && <p className="text-sm text-muted">{t('stickers.form.modeSplitHint')}</p>}
                    </div>
                )}
                {photos.length > 0 && (<>
                    <div>
                        <label className="field-label" htmlFor="sticker-place">{t('stickers.form.place')}</label>
                        <input id="sticker-place" className="kce-input" value={shownPlace} maxLength={120}
                               onChange={e => split ? updateCurrentPhoto({place: e.target.value}) : setPlace(e.target.value)}
                               placeholder={t('stickers.form.placeHint')}/>
                    </div>
                    <div>
                        <label className="field-label">{t('stickers.form.location')}</label>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-sm flex items-center gap-1 ${shownPos ? 'text-ink' : 'text-muted'}`}>
                                <MapPin size={16} aria-hidden="true"/>
                                {!shownPos ? t('stickers.form.locationHint') : shownFromPhoto ? t('stickers.form.fromPhoto') : t('stickers.form.pinSet')}
                            </span>
                            {shownPos && !showMap && (
                                <Button type="button" variant="secondary" size="xs" onClick={() => setShowMap(true)}>
                                    {t('stickers.form.adjustPin')}
                                </Button>
                            )}
                            <Button type="button" variant="secondary" size="xs" onClick={useMyLocation}>
                                {t('stickers.form.useMyLocation')}
                            </Button>
                        </div>
                        {/* The map is only needed when the photo carried no position, or to fine-tune it:
                            keeping it folded keeps the dialog short instead of a long scrolling form. */}
                        {(showMap || !shownPos) && (
                            <div className="mt-2">
                                <MapBox online={online}>
                                    <StickerMap picked={shownPos} onPick={p => { void setPinForCurrent(p, false) }}
                                                mapStyle={mapStyle}
                                                className="w-full h-56 rounded-xl overflow-hidden border border-line"/>
                                </MapBox>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="field-label" htmlFor="sticker-day">{t('stickers.form.date')}</label>
                        <input id="sticker-day" type="date" className="kce-input" value={shownDay} max={todayDateInput()}
                               onChange={e => split ? updateCurrentPhoto({takenOn: e.target.value}) : setDay(e.target.value)}/>
                    </div>
                    <div>
                        <label className="field-label" htmlFor="sticker-caption">{t('stickers.form.caption')}</label>
                        <textarea id="sticker-caption" className="kce-input resize-none" rows={2} maxLength={1000}
                                  value={caption} onChange={e => setCaption(e.target.value)}/>
                    </div>
                </>)}
                <Button type="submit" variant="primary" block disabled={!canSave}>
                    {saving ? t('action.saving') : t('action.save')}
                </Button>
            </div>
        </Sheet>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Feed cards rendered at first and added each time the end of the list nears the screen. */
const FEED_PAGE = 8

export function StickersPage() {
    const t = useT()
    const qc = useQueryClient()
    const locale = useI18n(s => s.locale)
    const online = useOnline()
    const regularMembers = useAppStore(s => s.regularMembers)
    const [tab, setTab] = useHashTab<'feed' | 'map'>('feed', ['feed', 'map'])
    const [form, setForm] = useState<Sticker | 'new' | null>(null)
    const [searchOpen, setSearchOpen] = useState(false)
    const [delId, setDelId] = useState<number | null>(null)
    const [openComment, setOpenComment] = useState<number | null>(null)
    const [highlightComment, setHighlightComment] = useState<number | null>(null)
    const [target, setTarget] = useState<number | null>(null)
    const [q, setQ] = useState('')
    const hashVersion = useDeepLinkVersion()
    const [limit, setLimit] = useState(FEED_PAGE)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const stopFlash = useRef<(() => void) | null>(null)

    const {data: stickers = [], isLoading} = useQuery({queryKey: ['stickers'], queryFn: api.listStickers})
    const {data: club} = useClub()
    const mapStyle = club?.settings?.map_style

    useEffect(() => () => stopFlash.current?.(), [])

    // Deep link (`?item=ID[&comment=ID]`, from comment notifications, global search and the map popup).
    useEffect(() => {
        const params = getHashParams()
        const item = params.get('item')
        if (!item) return
        const comment = params.get('comment')
        setQ('')
        setTarget(parseInt(item, 10))
        setHighlightComment(comment ? parseInt(comment, 10) : null)
        if (tab !== 'feed') setTab('feed')
        clearHashParams()
    }, [hashVersion]) // eslint-disable-line react-hooks/exhaustive-deps

    function extraNamesFor(s: Sticker): string[] {
        if (!s.created_by_name) return []
        const m = regularMembers.find(rm => rm.nickname === s.created_by_name || rm.name === s.created_by_name)
        return m ? [m.name, m.nickname ?? ''] : []
    }

    const shown = q.trim() ? stickers.filter(s => matchesSticker(s, q, extraNamesFor(s))) : stickers
    const visible = shown.slice(0, limit)
    const posters = posterNames(stickers)

    useEffect(() => {
        if (target === null || tab !== 'feed' || !stickers.some(s => s.id === target)) return
        // A deep link may point past the cards rendered so far: render up to it first.
        const at = shown.findIndex(s => s.id === target)
        if (at < 0) return
        if (at >= limit) { setLimit(at + 1); return }
        setOpenComment(highlightComment !== null ? target : null)
        stopFlash.current?.()
        stopFlash.current = flashDeepLinkTarget(`sticker-${target}`)
        setTarget(null)
    }, [target, tab, stickers, shown, limit]) // eslint-disable-line react-hooks/exhaustive-deps

    // Render the feed a page at a time: every card also fetches its reactions/comments and photos.
    const hasMore = tab === 'feed' && shown.length > limit
    useEffect(() => {
        const el = sentinelRef.current
        if (!hasMore || !el || typeof IntersectionObserver === 'undefined') {
            if (hasMore && typeof IntersectionObserver === 'undefined') setLimit(shown.length)
            return
        }
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) setLimit(l => l + FEED_PAGE)
        }, {rootMargin: '800px 0px'})
        io.observe(el)
        return () => io.disconnect()
    }, [hasMore, limit, shown.length])

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
            <div className="flex-shrink-0 px-3 pt-2 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <ModeToggle value={tab} onChange={v => setTab(v as 'feed' | 'map')}
                                options={[{value: 'feed', label: t('stickers.view.feed')},
                                          {value: 'map', label: t('stickers.view.map')}]}/>
                </div>
                {stickers.length > 0 && (
                    <Button type="button" onClick={() => setSearchOpen(o => !o)} aria-label={t('stickers.search')}
                            aria-expanded={searchOpen || q !== ''}
                            variant="secondary" className="w-9 h-9 flex-shrink-0 flex items-center justify-center p-0">
                        <Search size={18} aria-hidden="true"/>
                    </Button>
                )}
                <Button type="button" variant="primary" className="w-9 h-9 flex-shrink-0 flex items-center justify-center p-0"
                        onClick={() => setForm('new')} aria-label={t('stickers.add')}>
                    <Plus size={20} aria-hidden="true"/>
                </Button>
            </div>
            {stickers.length > 0 && (searchOpen || q !== '') && (
                <div className="flex-shrink-0 px-3 pt-2 flex flex-col gap-1.5">
                    <SearchInput value={q} onChange={setQ} placeholder={t('stickers.search')}/>
                    {posters.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                            {posters.map(name => {
                                const active = q.trim().toLowerCase() === name.toLowerCase()
                                return (
                                    <button key={name} type="button" aria-pressed={active}
                                            className={`${active ? 'chip active' : 'chip'} flex-shrink-0`}
                                            onClick={() => setQ(active ? '' : name)}>
                                        {name}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'map' ? (
                <div className="flex-1 min-h-0 px-3 pt-2 pb-3 flex flex-col overflow-hidden">
                    {isLoading && <SkeletonCard className="w-full h-full flex-1"/>}
                    {!isLoading && stickers.length === 0 && <Empty icon="🏷️" text={t('stickers.none')}/>}
                    {stickers.length > 0 && shown.length === 0 && <Empty icon="🔍" text={t('stickers.search.empty')}/>}
                    {shown.length > 0 && (
                        <MapBox online={online} className="flex-1 min-h-0 w-full h-full flex flex-col">
                            <StickerMap stickers={shown} mapStyle={mapStyle}
                                        openLabel={t('stickers.map.open')}
                                        className="w-full h-full flex-1 rounded-xl overflow-hidden border border-line"
                                        onOpen={id => { setQ(''); setTarget(id); setTab('feed') }}/>
                        </MapBox>
                    )}
                </div>
            ) : (
                <div className="page-scroll flex-1 px-3 pt-2 pb-24">
                    {stickers.length > 0 && (
                        <p className="text-xs text-muted mb-2">
                            {t('stickers.count').replace('{n}', String(shown.length))
                                .replace('{p}', String(placeCount(shown)))}
                        </p>
                    )}
                    {isLoading && <SkeletonCard className="mb-2"/>}
                    {!isLoading && stickers.length === 0 && <Empty icon="🏷️" text={t('stickers.none')}/>}

                    {stickers.length > 0 && shown.length === 0 && <Empty icon="🔍" text={t('stickers.search.empty')}/>}

                    <div className="flex flex-col gap-3">
                        {visible.map(s => (
                            <div key={s.id} id={`sticker-${s.id}`} className="kce-card p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm leading-snug truncate">
                                            <MapPin size={14} aria-hidden="true" className="inline -mt-0.5 mr-1"/>
                                            <span className="font-bold text-ink">{s.place_name}</span>
                                            <span className="text-xs text-muted">
                                                {s.stuck_on && <> · {fDay(s.stuck_on, locale)}</>}
                                                {s.created_by_name && <> · {s.created_by_name}</>}
                                            </span>
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
                                <PhotoGallery urls={s.media_urls} title={s.place_name}
                                              subtitle={s.stuck_on ? fDay(s.stuck_on, locale) : undefined}
                                              shareUrl={`/stickers?tab=feed&item=${s.id}`}/>
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
                        {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px"/>}
                    </div>
                </div>
            )}

            {form !== null && (
                <StickerForm sticker={form === 'new' ? null : form} mapStyle={mapStyle} onClose={() => setForm(null)}
                             onSaved={async () => { setForm(null); await refresh() }}/>
            )}

            {delId !== null && (
                <ConfirmSheet open onClose={() => setDelId(null)} title={t('action.delete')}
                              message={t('stickers.deleteConfirm')} onConfirm={() => handleDelete(delId)}/>
            )}
        </div>
    )
}
