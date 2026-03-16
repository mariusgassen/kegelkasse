import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import { useRef, useState, useEffect } from 'react'

interface EmojiPickerButtonProps {
    value: string
    onChange: (emoji: string) => void
}

export function EmojiPickerButton({ value, onChange }: EmojiPickerButtonProps) {
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

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className="kce-input w-14 text-center text-xl cursor-pointer"
                onClick={() => setOpen(o => !o)}
            >
                {value || '😀'}
            </button>
            {open && (
                <div className="absolute z-50 bottom-full mb-1 left-0">
                    <EmojiPicker
                        onEmojiClick={(data: EmojiClickData) => {
                            onChange(data.emoji)
                            setOpen(false)
                        }}
                        height={350}
                        width={300}
                        skinTonesDisabled
                        previewConfig={{ showPreview: false }}
                    />
                </div>
            )}
        </div>
    )
}
