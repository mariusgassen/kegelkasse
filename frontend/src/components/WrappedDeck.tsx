import {useEffect, useMemo, useRef, useState} from 'react'
import {useT} from '@/i18n'
import type {WrappedStats} from '@/types'
import {buildWrappedCards, type WrappedAccent} from '@/lib/wrapped'
import {useThrowTracking} from '@/hooks/useClub.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

const ACCENT_CLASS: Record<WrappedAccent, string> = {
    primary: 'text-kce-primary',
    amber: 'text-kce-amber',
    red: 'text-red-400',
    green: 'text-green-400',
    cream: 'text-kce-cream',
}

interface WrappedDeckProps {
    open: boolean
    onClose: () => void
    stats: WrappedStats
}

export function WrappedDeck({open, onClose, stats}: WrappedDeckProps) {
    const t = useT()
    const throwTracking = useThrowTracking()
    const cards = useMemo(() => buildWrappedCards(stats, fe, throwTracking), [stats, throwTracking])
    const [idx, setIdx] = useState(0)
    const touchStartX = useRef<number | null>(null)

    useEffect(() => {
        if (open) setIdx(0)
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowRight') setIdx(i => Math.min(cards.length - 1, i + 1))
            else if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1))
        }
        document.addEventListener('keydown', onKey)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = ''
        }
    }, [open, onClose, cards.length])

    if (!open) return null

    // Advancing past the final card closes the deck (the last slide reads "tap to finish").
    const next = () => {
        if (idx >= cards.length - 1) onClose()
        else setIdx(idx + 1)
    }
    const prev = () => setIdx(i => Math.max(0, i - 1))
    const card = cards[idx]
    const isFinale = card.id === 'finale'
    const accent = ACCENT_CLASS[card.accent]

    const onTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX
    }
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return
        const dx = e.changedTouches[0].clientX - touchStartX.current
        if (dx < -40) next()
        else if (dx > 40) prev()
        touchStartX.current = null
    }

    // Tap left third → prev, otherwise → next (Instagram-story style).
    const onTap = (e: React.MouseEvent) => {
        const {left, width} = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - left
        if (x < width / 3) prev()
        else next()
    }

    return (
        <div
            className="fixed inset-0 z-[60] flex flex-col"
            style={{
                background: 'radial-gradient(circle at 50% 20%, var(--kce-surface2), var(--kce-bg) 70%)',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
            role="dialog"
            aria-modal="true"
            aria-label={t('wrapped.title')}
        >
            {/* Progress segments — tappable to jump to any card (incl. back). */}
            <div className="flex gap-1 px-3 pt-3 pb-1">
                {cards.map((c, i) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setIdx(i)}
                        aria-label={t(c.headlineKey as never)}
                        className="flex-1 py-2 -my-1 cursor-pointer"
                    >
                        <div className="h-1 rounded-full overflow-hidden bg-kce-border">
                            <div
                                className="h-full bg-kce-cream transition-all"
                                style={{width: i <= idx ? '100%' : '0%', opacity: i <= idx ? 1 : 0.3}}
                            />
                        </div>
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
                <div className="text-xs font-bold text-kce-muted uppercase tracking-wider">
                    {t('wrapped.title')} {stats.year}
                </div>
                <button
                    onClick={onClose}
                    aria-label={t('action.close')}
                    className="w-11 h-11 flex items-center justify-center text-kce-cream text-2xl active:opacity-60"
                >
                    ✕
                </button>
            </div>

            {/* Card body — tap to advance */}
            <div
                className="flex-1 flex flex-col items-center justify-center px-8 text-center select-none cursor-pointer"
                onClick={onTap}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <div className="text-7xl mb-6 animate-[pop_.4s_ease]" key={card.id}>{card.emoji}</div>

                {isFinale ? (
                    <>
                        <div className="text-xs font-bold text-kce-muted uppercase tracking-[0.2em] mb-3">
                            {t(card.headlineKey as never)}
                        </div>
                        <div className={`font-display font-bold text-4xl leading-tight ${accent}`}>
                            {card.subtextKey ? t(card.subtextKey as never) : ''}
                        </div>
                        {card.subtextKey && (
                            <div className="text-sm text-kce-cream/80 mt-3 max-w-xs">
                                {t(`${card.subtextKey}.sub` as never)}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="text-xs font-bold text-kce-muted uppercase tracking-[0.2em] mb-4">
                            {t(card.headlineKey as never)}
                        </div>
                        <div className={`font-display font-bold text-6xl leading-none ${accent}`}>
                            {card.value}
                        </div>
                        {(card.subtextKey || card.subtextValue) && (
                            <div className="text-sm text-kce-cream/80 mt-4">
                                {card.subtextKey ? t(card.subtextKey as never) : ''}
                                {card.subtextKey && card.subtextValue ? ' ' : ''}
                                {card.subtextValue ?? ''}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="flex items-center justify-center gap-2 pb-6 text-[11px] text-kce-muted">
                {idx < cards.length - 1 ? t('wrapped.tapNext') : t('wrapped.tapDone')}
            </div>
        </div>
    )
}
