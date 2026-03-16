import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react'
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/i18n'

const PICKER_W = 300
const PICKER_H = 380

interface EmojiPickerButtonProps {
    value: string
    onChange: (value: string) => void
    /** "icon" = full replacement button (default); "insert" = small append button beside a text input */
    mode?: 'icon' | 'insert'
}

export function EmojiPickerButton({ value, onChange, mode = 'icon' }: EmojiPickerButtonProps) {
    const t = useT()
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const triggerRef = useRef<HTMLButtonElement>(null)
    const pickerRef = useRef<HTMLDivElement>(null)

    function openPicker() {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        const spaceAbove = rect.top
        const spaceBelow = window.innerHeight - rect.bottom
        const top = spaceAbove >= PICKER_H + 8 || spaceAbove > spaceBelow
            ? rect.top - PICKER_H - 8
            : rect.bottom + 8
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - PICKER_W - 8))
        setPos({ top, left })
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        function onMouseDown(e: MouseEvent) {
            const target = e.target as Node
            if (!triggerRef.current?.contains(target) && !pickerRef.current?.contains(target)) {
                setOpen(false)
            }
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
        onChange(mode === 'insert' ? value + data.emoji : data.emoji)
        setOpen(false)
    }

    const portal = open && createPortal(
        <div
            ref={pickerRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
        >
            <EmojiPicker
                onEmojiClick={handlePick}
                theme={Theme.DARK}
                height={PICKER_H}
                width={PICKER_W}
                searchDisabled
                skinTonesDisabled
                previewConfig={{ showPreview: false }}
                lazyLoadEmojis
            />
        </div>,
        document.body
    )

    if (mode === 'insert') {
        return (
            <>
                <button
                    ref={triggerRef}
                    type="button"
                    className="btn-secondary btn-xs h-full px-2 flex-shrink-0"
                    title={t('emoji.insert')}
                    onClick={openPicker}
                >
                    😀
                </button>
                {portal}
            </>
        )
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="kce-input w-14 text-center text-xl cursor-pointer"
                title={t('emoji.pick')}
                onClick={openPicker}
            >
                {value || '😀'}
            </button>
            {portal}
        </>
    )
}
