/**
 * Read-only chronological event list (penalties, drink rounds, highlights, milestone throws).
 *
 * Shared between the live evening cockpit (`LiveEveningView`, #65) and the closed-evening detail
 * in the History section (#84 follow-up) — both need to render the same `buildEventFeed()` output,
 * just with a different heading and a different cap on how far back it reaches.
 */
import {Caption} from '@/components/ui/Caption.tsx'
import {useT} from '@/i18n'
import type {LiveEvent} from '@/lib/liveEvening.ts'
import {gameBandColor} from '@/lib/protocolTimeline.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fTime(ms: number) {
    return new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

/** Compact relative time: "gerade eben", "vor N min", "vor N h", else clock time. */
export function relTime(ts: number, now: number, t: (k: 'live.now') => string): string {
    const diff = Math.max(0, now - ts)
    const min = Math.floor(diff / 60000)
    if (min < 1) return t('live.now')
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    if (h < 12) return `${h} h`
    return fTime(ts)
}

export function EventTicker({events}: {events: LiveEvent[]}) {
    const t = useT()
    const now = Date.now()

    if (events.length === 0) {
        return <div className="kce-card p-4 text-center text-xs text-muted">{t('live.tickerEmpty')}</div>
    }

    return (
        <div className="flex flex-col gap-1.5">
            {events.map(e => {
                if (e.kind === 'game_started') {
                    const bandColor = e.band != null ? gameBandColor(e.band) : 'var(--accent)'
                    return (
                        <div key={e.key} data-testid={`live-game-start-${e.key.slice(3)}`}
                             className="flex items-center gap-2 py-1 px-1">
                            <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                            <Caption className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="inline-block w-2 h-2 rounded-full" style={{background: bandColor}}/>
                                ▶ {e.title} · {fTime(e.ts)}
                            </Caption>
                            <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                        </div>
                    )
                }
                if (e.kind === 'game_finished') {
                    const bandColor = e.band != null ? gameBandColor(e.band) : 'var(--line)'
                    return (
                        <div key={e.key} data-testid={`live-game-finish-${e.key.slice(3)}`}
                             className="flex items-center gap-2 py-1 px-1">
                            <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                            <Caption className="flex items-center gap-1.5 flex-shrink-0">
                                🏁 {e.title}{e.subtitle ? ` · ${e.subtitle}` : ''} · {fTime(e.ts)}
                            </Caption>
                            <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                        </div>
                    )
                }
                const style = {
                    ...(e.kind === 'throw' ? {background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))'} : {}),
                    ...(e.band != null ? {borderLeft: `4px solid ${gameBandColor(e.band)}`} : {}),
                }
                return (
                    <div key={e.key}
                         data-band={e.band != null ? e.band : undefined}
                         className="kce-card px-3 py-2 flex items-center gap-2.5"
                         style={Object.keys(style).length > 0 ? style : undefined}>
                        <span className="text-lg flex-shrink-0">{e.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-ink truncate">{e.title}</div>
                            {e.kind === 'throw'
                                ? <div className="text-sm font-bold text-accent-fg truncate">{t('live.allNine')}</div>
                                : e.subtitle && <div className="text-sm text-muted truncate">{e.subtitle}</div>}
                        </div>
                        {e.amount != null && e.amount > 0 && (
                            <span className="text-sm font-bold text-accent-fg flex-shrink-0">{fe(e.amount)}</span>
                        )}
                        <span className="text-xs text-muted flex-shrink-0 w-14 text-right">{relTime(e.ts, now, t)}</span>
                    </div>
                )
            })}
        </div>
    )
}
