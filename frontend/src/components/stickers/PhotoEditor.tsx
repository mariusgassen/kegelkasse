/**
 * Basic photo editor for the sticker form: rotate, crop to a preset shape, zoom and drag to
 * frame. Works on a canvas copy; nothing is uploaded until the member taps "Apply".
 */
import {useEffect, useRef, useState} from 'react'
import {RotateCcw, RotateCw} from 'lucide-react'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {useT} from '@/i18n'
import {ASPECTS, INITIAL_EDIT, MAX_ZOOM, drawEdited, renderEdited, type Aspect, type EditState} from '@/lib/photoEdit.ts'
import {Button} from '@/components/ui/Button.tsx'

interface Props {
    src: string
    onCancel: () => void
    /** Receives the edited JPEG; the caller uploads it. */
    onApply: (file: File) => void | Promise<void>
}

const PREVIEW_SIDE = 720

export function PhotoEditor({src, onCancel, onApply}: Props) {
    const t = useT()
    const canvas = useRef<HTMLCanvasElement>(null)
    const img = useRef<HTMLImageElement | null>(null)
    const drag = useRef<{x: number; y: number} | null>(null)
    const [state, setState] = useState<EditState>(INITIAL_EDIT)
    const [ready, setReady] = useState(false)
    const [failed, setFailed] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        const i = new Image()
        i.onload = () => { img.current = i; setReady(true) }
        i.onerror = () => setFailed(true)
        i.src = src
    }, [src])

    useEffect(() => {
        if (ready && img.current && canvas.current) drawEdited(canvas.current, img.current, state, PREVIEW_SIDE)
    }, [ready, state])

    const patch = (p: Partial<EditState>) => setState(s => ({...s, ...p}))
    const rotate = (dir: 1 | -1) => setState(s => ({
        ...s, rotation: ((s.rotation + (dir === 1 ? 90 : 270)) % 360) as EditState['rotation'], panX: 0, panY: 0,
    }))

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        drag.current = {x: e.clientX, y: e.clientY}
        e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!drag.current) return
        const box = e.currentTarget.getBoundingClientRect()
        const dx = e.clientX - drag.current.x
        const dy = e.clientY - drag.current.y
        drag.current = {x: e.clientX, y: e.clientY}
        // Dragging the picture one way moves the crop window the other way.
        setState(s => ({
            ...s,
            panX: Math.max(-1, Math.min(1, s.panX - dx / (box.width / 2) * s.zoom)),
            panY: Math.max(-1, Math.min(1, s.panY - dy / (box.height / 2) * s.zoom)),
        }))
    }

    async function apply() {
        if (!img.current) return
        setBusy(true)
        try {
            const blob = await renderEdited(img.current, state)
            await onApply(new File([blob], `sticker-${Date.now()}.jpg`, {type: 'image/jpeg'}))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open onClose={onCancel} title={t('stickers.editor.title')}>
            <div className="flex flex-col gap-3">
                {failed && <p className="text-sm text-danger-fg">{t('stickers.editor.loadFailed')}</p>}
                {!failed && (
                    <canvas ref={canvas} data-testid="photo-editor-canvas"
                            className="w-full max-h-[50vh] object-contain rounded-xl border border-line bg-canvas touch-none"
                            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
                            onPointerUp={() => { drag.current = null }}
                            onPointerCancel={() => { drag.current = null }}/>
                )}
                {!failed && <p className="text-sm text-muted">{t('stickers.editor.dragHint')}</p>}
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" size="xs" className="flex items-center gap-1" onClick={() => rotate(-1)}>
                        <RotateCcw size={16} aria-hidden="true"/> {t('stickers.editor.rotateLeft')}
                    </Button>
                    <Button type="button" variant="secondary" size="xs" className="flex items-center gap-1" onClick={() => rotate(1)}>
                        <RotateCw size={16} aria-hidden="true"/> {t('stickers.editor.rotateRight')}
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('stickers.editor.shape')}>
                    {ASPECTS.map((a: Aspect) => (
                        <button key={a} type="button" aria-pressed={state.aspect === a}
                                className={`chip ${state.aspect === a ? 'active' : ''}`}
                                onClick={() => patch({aspect: a, panX: 0, panY: 0})}>
                            {a === 'original' ? t('stickers.editor.original') : a}
                        </button>
                    ))}
                </div>
                <label className="field-label" htmlFor="photo-zoom">{t('stickers.editor.zoom')}</label>
                <input id="photo-zoom" type="range" min={1} max={MAX_ZOOM} step={0.05} value={state.zoom}
                       onChange={e => patch({zoom: Number(e.target.value)})} className="w-full accent-accent"/>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>{t('action.cancel')}</Button>
                    <Button type="button" variant="primary" className="flex-1" disabled={!ready || busy} onClick={apply}>
                        {busy ? t('action.saving') : t('stickers.editor.apply')}
                    </Button>
                </div>
            </div>
        </Sheet>
    )
}
