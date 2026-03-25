import {useRef, useState} from 'react'
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
                    className="h-16 w-16 object-cover rounded border border-kce-border"
                />
                <button
                    type="button"
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center leading-none"
                    onClick={onRemove}
                    title={t('media.remove')}
                >
                    ×
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
                title={t('media.attach')}
            >
                {uploading ? '⏳' : '🖼'}
            </button>
        </>
    )
}
