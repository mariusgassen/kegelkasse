import type {ReactNode} from 'react'
import {useT} from '@/i18n'

/**
 * Loading placeholders shaped like the content that is coming (#72).
 *
 * A skeleton beats a "Lade…" line for two reasons: the layout does not jump once data lands, and
 * the page reads as *nearly ready* rather than empty. Feature #78 already fixed the worse bug here
 * — charts showing their empty state while still loading — this replaces the text that fix left.
 *
 * Every skeleton is a `role="status"` region carrying a visually hidden label, so the loading state
 * stays announced to a screen reader; a purely visual skeleton would have quietly removed the only
 * thing there was to announce. The shimmer respects `prefers-reduced-motion` (see `index.css`); a
 * skeleton that holds still is still a skeleton, so it is not behind the 🎉 effects switch.
 */

interface SkeletonRegionProps {
    children: ReactNode
    className?: string
    'data-testid'?: string
}

/** The announced wrapper every skeleton shape shares. */
function SkeletonRegion({children, className = '', ...rest}: SkeletonRegionProps) {
    const t = useT()
    return (
        <div role="status" aria-busy="true" className={className} data-testid={rest['data-testid']}>
            <span className="sr-only">{t('action.loading')}</span>
            {children}
        </div>
    )
}

interface SkeletonProps {
    /** Any CSS length; defaults to filling the parent. */
    width?: string
    height?: string
    /** `full` for avatars and pills, `md` for text and blocks. */
    rounded?: 'md' | 'full'
    className?: string
}

/** One shimmering block. The building brick — compose these for a bespoke shape. */
export function Skeleton({width = '100%', height = '1rem', rounded = 'md', className = ''}: SkeletonProps) {
    return (
        <span
            aria-hidden="true"
            className={`kce-skeleton block ${rounded === 'full' ? 'rounded-full' : 'rounded-md'} ${className}`}
            style={{width, height}}
        />
    )
}

/**
 * A list of member/booking rows: avatar, two lines of text, a trailing amount.
 * Mirrors `<MemberRow>`, which is what most of these lists render once loaded.
 */
export function SkeletonRows({rows = 4, className = '', ...rest}: { rows?: number; className?: string; 'data-testid'?: string }) {
    return (
        <SkeletonRegion className={`space-y-2 ${className}`} data-testid={rest['data-testid']}>
            {Array.from({length: rows}, (_, i) => (
                <div key={i} className="kce-card p-3 flex items-center gap-3">
                    <Skeleton width="40px" height="40px" rounded="full"/>
                    <div className="flex-1 min-w-0 space-y-1.5">
                        <Skeleton width="55%" height="0.9rem"/>
                        <Skeleton width="35%" height="0.8rem"/>
                    </div>
                    <Skeleton width="56px" height="1rem"/>
                </div>
            ))}
        </SkeletonRegion>
    )
}

/** A card-shaped placeholder: heading plus a few lines of body. */
export function SkeletonCard({lines = 3, className = '', ...rest}: { lines?: number; className?: string; 'data-testid'?: string }) {
    return (
        <SkeletonRegion className={`kce-card p-3 space-y-2 ${className}`} data-testid={rest['data-testid']}>
            <Skeleton width="45%" height="1rem"/>
            {Array.from({length: lines}, (_, i) => (
                <Skeleton key={i} width={i === lines - 1 ? '65%' : '100%'} height="0.8rem"/>
            ))}
        </SkeletonRegion>
    )
}

/** A chart-shaped placeholder — one block at the chart's own height, so nothing reflows. */
export function SkeletonChart({height = '160px', className = '', ...rest}: { height?: string; className?: string; 'data-testid'?: string }) {
    return (
        <SkeletonRegion className={className} data-testid={rest['data-testid']}>
            <Skeleton width="100%" height={height}/>
        </SkeletonRegion>
    )
}
