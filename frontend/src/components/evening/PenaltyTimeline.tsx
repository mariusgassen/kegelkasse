/**
 * Read-only rendering of a `PenaltyTimelineEvent[]` — penalty entries interleaved with
 * game start/finish dividers, visually matching `ProtocolPage`'s live timeline but
 * without any edit/delete affordances. Used by the History section's closed-evening
 * detail (#86 follow-up).
 */
import {useT} from '@/i18n'
import type {PenaltyTimelineEvent} from '@/lib/protocolTimeline.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fTime(ms: number) {
    return new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

export function PenaltyTimeline({events}: {events: PenaltyTimelineEvent[]}) {
    const t = useT()

    if (events.length === 0) {
        return <div className="kce-card p-4 text-center text-xs text-muted">{t('penalty.none')}</div>
    }

    return (
        <div className="flex flex-col gap-1.5">
            {events.map(event => {
                if (event.kind === 'game_started') {
                    return (
                        <div key={`gs-${event.game.id}`} className="flex items-center gap-2 my-1 px-1">
                            <div className="h-px flex-1 bg-line"/>
                            <span className="text-xs font-bold text-muted uppercase tracking-wider whitespace-nowrap">
                                ▶ {event.game.name} · {fTime(event.ts)}
                            </span>
                            <div className="h-px flex-1 bg-line"/>
                        </div>
                    )
                }
                if (event.kind === 'game_finished') {
                    return (
                        <div key={`gf-${event.game.id}`} className="flex items-center gap-2 my-1 px-1">
                            <div className="h-px flex-1 bg-accent/40"/>
                            <span className="text-xs font-bold text-accent-fg uppercase tracking-wider whitespace-nowrap">
                                🏁 {event.game.name}{event.game.winner_name ? ` · ${event.game.winner_name}` : ''} · {fTime(event.ts)}
                            </span>
                            <div className="h-px flex-1 bg-accent/40"/>
                        </div>
                    )
                }
                const {entry, gameName} = event
                return (
                    <div key={`p-${entry.id}`} className="kce-card px-3 py-2 flex items-center gap-2.5">
                        <span className="text-lg flex-shrink-0">{entry.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-ink truncate">{entry.player_name}</div>
                            <div className="text-sm text-muted truncate">
                                {entry.penalty_type_name}
                                {gameName && <span> · {gameName}</span>}
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <div className="text-sm font-bold text-danger-fg">
                                {entry.mode === 'euro'
                                    ? fe(entry.amount)
                                    : (entry.unit_amount != null ? `${entry.amount} × ${fe(entry.unit_amount)}` : `×${entry.amount}`)}
                            </div>
                            <div className="text-xs text-muted">{fTime(entry.client_timestamp)}</div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
