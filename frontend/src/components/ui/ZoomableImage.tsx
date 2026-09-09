import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {X} from 'lucide-react'
import {useT} from '@/i18n'

interface ZoomableImageProps {
    src: string
    alt?: string
    className?: string
}

/**
 * Drop-in replacement for a content `<img>` (comment/highlight/announcement photos) that opens
 * a fullscreen viewer on tap — the thumbnail itself never grows past its usual card size.
 */
export function ZoomableImage({src, alt = '', className}: ZoomableImageProps) {
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
                <img src={src} alt={alt} className={className}/>
            </button>
            {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)}/>}
        </>
    )
}

function Lightbox({src, alt, onClose}: {src: string; alt: string; onClose: () => void}) {
    const t = useT()
    const closeRef = useRef<HTMLButtonElement>(null)
    const previouslyFocusedRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    useEffect(() => {
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null
        closeRef.current?.focus()
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = ''
            previouslyFocusedRef.current?.focus()
        }
    }, [])

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('media.viewFullscreen')}
            className="fixed inset-0 z-[70] flex items-center justify-center animate-fade-in"
            style={{
                background: 'rgba(0,0,0,.92)',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            onClick={e => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <img
                src={src}
                alt={alt}
                className="object-contain"
                style={{maxWidth: '94vw', maxHeight: '90vh'}}
            />
            <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={t('action.close')}
                className="absolute top-4 right-4 w-11 h-11 rounded-full flex items-center justify-center text-white active:opacity-60"
                style={{background: 'rgba(255,255,255,0.12)'}}
            >
                <X size={22} strokeWidth={2.5} aria-hidden="true"/>
            </button>
        </div>,
        document.body
    )
}
