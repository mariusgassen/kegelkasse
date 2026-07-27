import {useRef, useState} from 'react'
import {ImagePlus, Loader2, X} from 'lucide-react'
import {uploadMedia} from '@/api/client'
import {toastError} from '@/utils/error'
import {useT} from '@/i18n'

interface Props {
    /** Called with the uploaded URL once the file is successfully uploaded. */
    onUploaded: (url: string) => void
    /** Current media URL (if any) — shows thumbnail and remove button. */
    value: string | null
    onRemove: () => void
}

export function MediaUploadButton({onUploaded, value, onRemove}: Props) {
    const t = useT()
    const inputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            const url = await uploadMedia(file)
            onUploaded(url)
        } catch (err) {
            toastError(err)
        } finally {
            setUploading(false)
            // Reset so the same file can be re-selected
            if (inputRef.current) inputRef.current.value = ''
        }
    }

    if (value) {
        return (
            <div className="relative inline-block">
                <img
                    src={value}
                    alt=""
                    className="h-16 w-16 object-cover rounded border border-line"
                />
                {/* Sits in the corner of a 64px thumbnail, so the 44px guidance cannot be met
                    without covering the image it belongs to — 24px is the largest that still reads
                    as a corner badge rather than an overlay. */}
                <button
                    type="button"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-danger text-on-danger flex items-center justify-center leading-none"
                    onClick={onRemove}
                    aria-label={t('media.remove')}
                >
                    <X size={14} strokeWidth={3} aria-hidden="true"/>
                </button>
            </div>
        )
    }

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFile}
            />
            <button
                type="button"
                className="btn-secondary btn-xs flex-shrink-0 flex items-center gap-1"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                aria-label={t('media.attach')}
            >
                {uploading
                    ? <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden="true"/>
                    : <ImagePlus size={16} strokeWidth={2} aria-hidden="true"/>}
            </button>
        </>
    )
}
