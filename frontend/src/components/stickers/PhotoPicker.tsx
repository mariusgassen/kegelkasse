/**
 * Photo selection for the sticker form: one large tile that opens the device's photo library
 * (several photos at once), then a big preview of the selected photo with a numbered strip of
 * everything chosen. Each photo can be edited (rotate/crop) or removed.
 */
import {useRef, useState} from 'react'
import {ChevronLeft, ChevronRight, Crop, ImagePlus, Loader2, Trash2} from 'lucide-react'
import {uploadMedia} from '@/api/client.ts'
import {useT} from '@/i18n'
import {toastError} from '@/utils/error.ts'
import {LazyImage} from '@/components/ui/LazyImage.tsx'
import {thumbUrl} from '@/lib/mediaUrl.ts'
import {PhotoEditor} from './PhotoEditor.tsx'

/** `file` is the original the member picked (kept for its EXIF data; an edit does not replace it). */
export interface Photo { url: string; file?: File }
export const MAX_PHOTOS = 10

interface Props {
    photos: Photo[]
    onChange: (photos: Photo[]) => void
    /** The freshly chosen originals (before upload), e.g. to read their EXIF position and date. */
    onFiles?: (files: File[]) => void
}

export function PhotoPicker({photos, onChange, onFiles}: Props) {
    const t = useT()
    const input = useRef<HTMLInputElement>(null)
    const [sel, setSel] = useState(0)
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState(false)
    const current = photos[Math.min(sel, photos.length - 1)]

    async function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const files = [...(e.target.files ?? [])].slice(0, MAX_PHOTOS - photos.length)
        e.target.value = ''
        if (!files.length) return
        onFiles?.(files)
        setBusy(true)
        const next = [...photos]
        try {
            for (const f of files) next.push({url: await uploadMedia(f), file: f})
        } catch (err) {
            toastError(err)
        } finally {
            if (next.length > photos.length) { onChange(next); setSel(photos.length) }
            setBusy(false)
        }
    }

    function remove() {
        const i = Math.min(sel, photos.length - 1)
        onChange(photos.filter((_, k) => k !== i))
        setSel(Math.max(0, i - 1))
    }

    function move(dir: -1 | 1) {
        const i = Math.min(sel, photos.length - 1)
        const j = i + dir
        if (j < 0 || j >= photos.length) return
        const next = [...photos]
        ;[next[i], next[j]] = [next[j], next[i]]
        onChange(next)
        setSel(j)
    }

    async function applyEdit(file: File) {
        try {
            const url = await uploadMedia(file)
            const i = Math.min(sel, photos.length - 1)
            onChange(photos.map((p, k) => k === i ? {...p, url} : p))
            setEditing(false)
        } catch (err) {
            toastError(err)
        }
    }

    const fileInput = (
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={addFiles}
               data-testid="photo-input"/>
    )

    if (!photos.length) {
        return (
            <>
                {fileInput}
                <button type="button" onClick={() => input.current?.click()} disabled={busy}
                        className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-line bg-canvas text-muted
                                   flex flex-col items-center justify-center gap-2 active:opacity-70">
                    {busy ? <Loader2 size={36} className="animate-spin" aria-hidden="true"/>
                          : <ImagePlus size={36} aria-hidden="true"/>}
                    <span className="font-bold text-ink">{t('stickers.form.pickPhotos')}</span>
                    <span className="text-sm px-6 text-center">{t('stickers.form.photoRequired')}</span>
                </button>
            </>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            {fileInput}
            <div className="relative rounded-2xl overflow-hidden border border-line bg-canvas">
                <LazyImage src={current.url} alt={`${t('stickers.form.photo')} ${sel + 1}`}
                           className="mx-auto max-w-full max-h-[45vh] object-contain" placeholderClassName="aspect-[4/3]"/>
                {photos.length > 1 && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-accent text-on-accent text-xs font-bold">
                        {Math.min(sel, photos.length - 1) + 1}/{photos.length}
                    </span>
                )}
                {busy && (
                    <div className="absolute inset-0 flex items-center justify-center bg-canvas opacity-80">
                        <Loader2 size={32} className="animate-spin text-ink" aria-hidden="true"/>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto py-1">
                    {photos.map((p, i) => (
                        <button key={p.url} type="button" onClick={() => setSel(i)}
                                aria-label={`${t('stickers.form.photo')} ${i + 1}`}
                                aria-pressed={i === sel}
                                className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 ${
                                    i === sel ? 'border-accent' : 'border-line'}`}>
                            <img src={thumbUrl(p.url, 240)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover"/>
                            <span className="absolute bottom-0 right-0 px-1.5 text-xs font-bold bg-accent text-on-accent rounded-tl">
                                {i + 1}
                            </span>
                        </button>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                        <button type="button" onClick={() => input.current?.click()} disabled={busy}
                                aria-label={t('stickers.form.addPhotos')}
                                className="flex-shrink-0 w-14 h-14 rounded-lg border-2 border-dashed border-line
                                           text-muted flex items-center justify-center active:opacity-70">
                            <ImagePlus size={20} aria-hidden="true"/>
                        </button>
                    )}
                </div>
            </div>
            <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-xs flex items-center gap-1"
                        onClick={() => setEditing(true)} disabled={busy}>
                    <Crop size={16} aria-hidden="true"/> {t('action.edit')}
                </button>
                <button type="button" className="btn-secondary btn-xs flex items-center gap-1"
                        onClick={remove} disabled={busy}>
                    <Trash2 size={16} aria-hidden="true"/> {t('stickers.form.removePhoto')}
                </button>
                {photos.length > 1 && (<>
                    <button type="button" className="btn-secondary btn-xs flex items-center" onClick={() => move(-1)}
                            disabled={busy || sel <= 0} aria-label={t('stickers.form.moveLeft')}>
                        <ChevronLeft size={16} aria-hidden="true"/>
                    </button>
                    <button type="button" className="btn-secondary btn-xs flex items-center" onClick={() => move(1)}
                            disabled={busy || sel >= photos.length - 1} aria-label={t('stickers.form.moveRight')}>
                        <ChevronRight size={16} aria-hidden="true"/>
                    </button>
                </>)}
            </div>
            {editing && <PhotoEditor src={current.url} onCancel={() => setEditing(false)} onApply={applyEdit}/>}
        </div>
    )
}
