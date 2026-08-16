import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Volume2, Play} from 'lucide-react'
import {useT} from '@/i18n'
import {SOUND_PRESETS, SoundPresetKey, previewSound} from '@/lib/soundboard'

const PICKER_W = 260
const PICKER_H = 340

interface SoundPickerButtonProps {
    value: string | null
    onChange: (value: string | null) => void
}

/** Mirrors EmojiPickerButton's popover shell for picking an admin-configured penalty call-out. */
export function SoundPickerButton({value, onChange}: SoundPickerButtonProps) {
    const t = useT()
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState({top: 0, left: 0})
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
        setPos({top, left})
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

    function handlePick(key: SoundPresetKey | null) {
        onChange(key)
        setOpen(false)
    }

    const current = SOUND_PRESETS.find(p => p.key === value)

    const portal = open && createPortal(
        <div
            ref={pickerRef}
            className="kce-card p-1.5 overflow-y-auto"
            style={{position: 'fixed', top: pos.top, left: pos.left, width: PICKER_W, maxHeight: PICKER_H, zIndex: 9999}}
        >
            <button
                type="button"
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left ${!value ? 'bg-surface-2' : ''}`}
                onClick={() => handlePick(null)}
            >
                <span aria-hidden="true">🔇</span>
                <span>{t('sound.none')}</span>
            </button>
            {SOUND_PRESETS.map(p => (
                <div key={p.key} className={`flex items-center gap-1 rounded-lg ${value === p.key ? 'bg-surface-2' : ''}`}>
                    <button
                        type="button"
                        className="flex-1 flex items-center gap-2 px-2 py-2 text-sm text-left"
                        onClick={() => handlePick(p.key)}
                    >
                        <span aria-hidden="true">{p.emoji}</span>
                        <span>{t(p.labelKey as any)}</span>
                    </button>
                    <button
                        type="button"
                        className="btn-secondary btn-xs h-8 w-8 flex-shrink-0 flex items-center justify-center"
                        aria-label={t('sound.preview')}
                        onClick={() => previewSound(p.key)}
                    >
                        <Play size={14} strokeWidth={2} aria-hidden="true"/>
                    </button>
                </div>
            ))}
        </div>,
        document.body
    )

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="kce-input w-14 flex items-center justify-center text-xl cursor-pointer"
                aria-label={t('sound.pick')}
                onClick={openPicker}
            >
                {current ? <span aria-hidden="true">{current.emoji}</span> : <Volume2 size={18} strokeWidth={2} className="text-muted" aria-hidden="true"/>}
            </button>
            {portal}
        </>
    )
}
