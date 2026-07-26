import {useCountUp} from '@/hooks/useCountUp'
import {DURATION} from '@/lib/motion'

interface CountUpProps {
    value: number
    /** How the tweened number is turned into text — pass the page's own money formatter. */
    format: (v: number) => string
    duration?: number
    className?: string
    'data-testid'?: string
}

/**
 * A number that animates to its new value instead of snapping (#72).
 *
 * The formatter is a prop rather than built in because every page already has one (`fe()`), and a
 * count-up that reformatted currency its own way would drift from the text next to it. The mid-tween
 * values are fractional, so the formatter must round — which the euro formatters already do.
 *
 * `aria-live` is deliberately absent: the intermediate values are decoration, and announcing forty
 * of them would be hostile. Screen readers read the final value like any other text.
 */
export function CountUp({value, format, duration = DURATION.base, className, ...rest}: CountUpProps) {
    const shown = useCountUp(value, duration)
    return <span className={className} data-testid={rest['data-testid']}>{format(shown)}</span>
}
