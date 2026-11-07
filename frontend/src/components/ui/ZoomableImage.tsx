import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from 'react'
import {createPortal} from 'react-dom'
import {Share2, Link as LinkIcon, Download} from 'lucide-react'
import {useT} from '@/i18n'
import {LazyImage} from '@/components/ui/LazyImage.tsx'
import {showToast} from '@/components/ui/Toast.tsx'

interface ZoomableImageProps {
    src: string
    alt?: string
    className?: string
    /** Classes for the placeholder box shown while the photo loads. */
    placeholderClassName?: string
    /** Optional metadata (e.g. place, date) shown in the fullscreen overlay after a tap. */
    title?: string
    subtitle?: string
}

/**
 * Drop-in replacement for a content `<img>` (comment/highlight/announcement photos) that opens
 * a fullscreen viewer on tap — the thumbnail itself never grows past its usual card size.
 */
export function ZoomableImage({src, alt = '', className, placeholderClassName, title, subtitle}: ZoomableImageProps) {
    const t = useT()
    const [open, setOpen] = useState(false)
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={t('media.viewFullscreen')}
                className="block cursor-zoom-in"
            >
                <LazyImage src={src} alt={alt} className={className} placeholderClassName={placeholderClassName}/>
            </button>
            {open && <Lightbox src={src} alt={alt} title={title} subtitle={subtitle} onClose={() => setOpen(false)}/>}
        </>
    )
}

const DISMISS_DISTANCE = 110

function Lightbox({src, alt, title, subtitle, onClose}: {
    src: string; alt: string; title?: string; subtitle?: string; onClose: () => void
}) {
    const t = useT()
    const dialogRef = useRef<HTMLDivElement>(null)
    const previouslyFocusedRef = useRef<HTMLElement | null>(null)
    const [overlay, setOverlay] = useState(false)
    const [menu, setMenu] = useState(false)
    const [dy, setDy] = useState(0)
    const drag = useRef<{y: number; x: number; moved: boolean} | null>(null)

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null
        dialogRef.current?.focus()
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = ''
            previouslyFocusedRef.current?.focus()
        }
    }, [])

    const absUrl = new URL(src, window.location.origin).toString()

    async function copyLink() {
        setMenu(false)
        try {
            await navigator.clipboard.writeText(absUrl)
            showToast(t('media.linkCopied'))
        } catch {
            showToast(t('media.copyFailed'), 'error')
        }
    }

    async function saveLocal() {
        setMenu(false)
        try {
            const res = await fetch(absUrl)
            if (!res.ok) throw new Error(String(res.status))
            const blob = await res.blob()
            const a = document.createElement('a')
            const objectUrl = URL.createObjectURL(blob)
            a.href = objectUrl
            a.download = new URL(absUrl).pathname.split('/').pop() || 'photo.jpg'
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
        } catch {
            showToast(t('media.saveFailed'), 'error')
        }
    }

    const onPointerDown = (e: ReactPointerEvent) => {
        drag.current = {y: e.clientY, x: e.clientX, moved: false}
    }
    const onPointerMove = (e: ReactPointerEvent) => {
        const d = drag.current
        if (!d) return
        const diffY = e.clientY - d.y
        if (!d.moved && Math.abs(diffY) < 8) return
        if (!d.moved && Math.abs(e.clientX - d.x) > Math.abs(diffY)) { drag.current = null; return }
        d.moved = true
        setDy(Math.max(0, diffY))
    }
    const onPointerUp = () => {
        const d = drag.current
        drag.current = null
        if (!d) return
        if (d.moved) {
            if (dy > DISMISS_DISTANCE) onClose()
            else setDy(0)
        } else {
            setMenu(false)
            setOverlay(o => !o)
        }
    }

    const hasMeta = Boolean(title || subtitle)
    const fade = Math.max(0.25, 1 - dy / 400)

    return createPortal(
        <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t('media.viewFullscreen')}
            className="fixed inset-0 z-[70] flex items-center justify-center animate-fade-in outline-none"
            style={{
                background: `rgba(0,0,0,${0.92 * fade})`,
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                touchAction: 'pan-x pinch-zoom',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { drag.current = null; setDy(0) }}
        >
            <div style={{transform: `translateY(${dy}px)`, transition: drag.current ? 'none' : 'transform var(--motion-base) var(--ease-standard)'}}>
                <LazyImage
                    src={src}
                    alt={alt}
                    width={1600}
                    eager
                    className="object-contain select-none"
                    style={{maxWidth: '94vw', maxHeight: '90vh'}}
                    placeholderClassName="w-[60vw] h-[40vh]"
                />
            </div>
            {overlay && dy === 0 && (
                <>
                    <div
                        data-testid="lightbox-overlay"
                        className="absolute left-0 right-0 bottom-0 px-4 pt-10 pb-4 flex items-end justify-between gap-3 text-white"
                        style={{
                            background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0))',
                            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
                        }}
                        onPointerDown={e => e.stopPropagation()}
                        onPointerUp={e => e.stopPropagation()}
                    >
                        <div className="min-w-0">
                            {title && <p className="font-bold text-sm truncate">{title}</p>}
                            {subtitle && <p className="text-xs opacity-80 truncate">{subtitle}</p>}
                            {!hasMeta && <span className="sr-only">{alt}</span>}
                        </div>
                        <button
                            type="button"
                            onClick={() => setMenu(m => !m)}
                            aria-label={t('media.share')}
                            aria-expanded={menu}
                            className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center active:opacity-60"
                            style={{background: 'rgba(255,255,255,0.16)'}}
                        >
                            <Share2 size={20} aria-hidden="true"/>
                        </button>
                    </div>
                    {menu && (
                        <div
                            role="menu"
                            className="absolute right-4 flex flex-col rounded-xl overflow-hidden text-white text-sm"
                            style={{
                                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)',
                                background: 'rgba(30,30,30,.96)',
                            }}
                            onPointerDown={e => e.stopPropagation()}
                            onPointerUp={e => e.stopPropagation()}
                        >
                            <button type="button" role="menuitem" onClick={copyLink}
                                    className="flex items-center gap-3 px-4 py-3 active:bg-white/10">
                                <LinkIcon size={18} aria-hidden="true"/>{t('media.copyLink')}
                            </button>
                            <button type="button" role="menuitem" onClick={saveLocal}
                                    className="flex items-center gap-3 px-4 py-3 active:bg-white/10">
                                <Download size={18} aria-hidden="true"/>{t('media.saveLocal')}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>,
        document.body
    )
}
