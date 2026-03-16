import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react'
import { useRef, useState, useEffect } from 'react'
import { useT } from '@/i18n'

interface EmojiPickerButtonProps {
    value: string
    onChange: (value: string) => void
    /** "icon" = full replacement button (default); "insert" = small append button beside a text input */
    mode?: 'icon' | 'insert'
}

export function EmojiPickerButton({ value, onChange, mode = 'icon' }: EmojiPickerButtonProps) {
    const t = useT()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function handler(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    function handlePick(data: EmojiClickData) {
        if (mode === 'insert') {
            onChange(value + data.emoji)
        } else {
            onChange(data.emoji)
        }
        setOpen(false)
    }

    const picker = open && (
        <div className={`absolute z-50 bottom-full mb-1 ${mode === 'insert' ? 'right-0' : 'left-0'}`}>
            <EmojiPicker
                onEmojiClick={handlePick}
                theme={Theme.DARK}
                height={350}
                width={300}
                skinTonesDisabled
                previewConfig={{ showPreview: false }}
                lazyLoadEmojis
            />
        </div>
    )

    if (mode === 'insert') {
        return (
            <div ref={ref} className="relative flex-shrink-0">
                <button
                    type="button"
                    className="btn-secondary btn-xs h-full px-2"
                    title={t('emoji.insert')}
                    onClick={() => setOpen(o => !o)}
                >
                    😀
                </button>
                {picker}
            </div>
        )
    }

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className="kce-input w-14 text-center text-xl cursor-pointer"
                title={t('emoji.pick')}
                onClick={() => setOpen(o => !o)}
            >
                {value || '😀'}
            </button>
            {picker}
        </div>
    )
}
