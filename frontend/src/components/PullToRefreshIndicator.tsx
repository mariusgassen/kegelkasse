import {ChevronDown} from 'lucide-react'
import {AppLogoAnimated} from '@/components/Logo'
import {PULL_THRESHOLD} from '@/hooks/usePullToRefresh'

interface Props {
    pullDistance: number
    dragging: boolean
    refreshing: boolean
}

/**
 * Sits at the top of <main>, not itself translated — the page content wrapper slides down
 * during a pull and "reveals" this indicator underneath, the way native pull-to-refresh works.
 * Drag phase: a chevron rotates 0°→180° as you approach the threshold (flips at "release to
 * refresh"). Refresh phase: swaps to the bobbing app logo, matching the boot-splash animation.
 */
export function PullToRefreshIndicator({pullDistance, dragging, refreshing}: Props) {
    if (!refreshing && pullDistance === 0 && !dragging) return null

    const progress = Math.min(pullDistance / PULL_THRESHOLD, 1)
    const pastThreshold = pullDistance >= PULL_THRESHOLD

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 56,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8,
            opacity: refreshing ? 1 : progress,
            transition: dragging ? 'none' : 'opacity 0.25s ease-out',
            pointerEvents: 'none',
        }}>
            {refreshing ? (
                <AppLogoAnimated size={26}/>
            ) : (
                <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--kce-surface2)',
                    color: pastThreshold ? 'var(--kce-primary)' : 'var(--kce-muted)',
                    transition: dragging ? 'none' : 'transform 0.25s ease-out, color 0.15s ease-out',
                    transform: `rotate(${pastThreshold ? 180 : progress * 180}deg) scale(${0.7 + progress * 0.3})`,
                }}>
                    <ChevronDown size={14} strokeWidth={2.5}/>
                </div>
            )}
        </div>
    )
}
