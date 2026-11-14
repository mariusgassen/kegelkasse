import {useEffect, useState} from 'react'
import {flourishEnabled} from '@/lib/motion'

export interface BarSegment {
    key: string
    value: number
    /** A colour token, e.g. `var(--danger)`. Never a literal (CLAUDE.md → Colors). */
    color: string
}

interface ProportionBarProps {
    segments: BarSegment[]
    /** What 100 % means. Defaults to the sum of the segments; pass a larger max to compare rows. */
    total?: number
    /** Bar thickness in px. */
    height?: number
    /** The bar is a picture of numbers that already stand as text nearby, so it needs a summary label.
     *  Pass `''` when an enclosing element already carries it — the bar is then hidden from assistive tech. */
    ariaLabel: string
    className?: string
    'data-testid'?: string
}

/** Grow from zero on first paint, once, when flourishes are allowed (same gate as `<CountUp>`). */
function useGrowIn(): boolean {
    const [grown, setGrown] = useState(() => !flourishEnabled() || typeof requestAnimationFrame !== 'function')
    useEffect(() => {
        if (grown) return
        const id = requestAnimationFrame(() => setGrown(true))
        return () => cancelAnimationFrame(id)
    }, [grown])
    return grown
}

/**
 * A thin horizontal bar of proportional segments — the visual twin of a row of numbers.
 *
 * Used where the Kasse shows figures that relate to each other (spent vs. remaining, paid vs. open)
 * so the relation reads at a glance without a separate chart. Segments with a non-positive value
 * are skipped; a bar with nothing to show renders nothing.
 */
export function ProportionBar({segments, total, height = 8, ariaLabel, className = '', ...rest}: ProportionBarProps) {
    const grown = useGrowIn()
    const visible = segments.filter(s => s.value > 0)
    const sum = visible.reduce((acc, s) => acc + s.value, 0)
    const max = Math.max(total ?? sum, sum)
    if (max <= 0 || visible.length === 0) return null
    return (
        <div role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel || undefined} aria-hidden={ariaLabel ? undefined : true}
             data-testid={rest['data-testid']}
             className={`flex gap-0.5 rounded-full bg-surface-2 overflow-hidden ${className}`}
             style={{height}}>
            {visible.map(s => (
                <div key={s.key} data-segment={s.key} className="kce-bar-seg h-full first:rounded-l-full last:rounded-r-full"
                     style={{
                         width: grown ? `${(s.value / max) * 100}%` : '0%',
                         background: s.color,
                         transition: 'width var(--motion-slow) var(--ease-standard)',
                     }}/>
            ))}
        </div>
    )
}

/** Small legend row for a `ProportionBar`: coloured dot + label (+ optional value). */
export function BarLegend({items}: { items: { key: string; color: string; label: string; value?: string }[] }) {
    return (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
            {items.map(i => (
                <span key={i.key} className="flex items-center gap-1">
                    <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{background: i.color}}/>
                    {i.label}{i.value ? <span className="font-bold text-ink">{i.value}</span> : null}
                </span>
            ))}
        </div>
    )
}
