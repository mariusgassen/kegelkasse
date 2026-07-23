/**
 * Live evening cockpit (#65, "Abend-Modus").
 *
 * The immersive default view while an evening is running: a live scoreboard header (running game,
 * whose turn it is, last throw), a headline stat row, thumb-sized quick actions, and a
 * chronological event ticker. Read-only over the active evening — all derivation lives in the
 * pure `lib/liveEvening.ts`; mutations go through the existing quick-entry / highlights / games
 * surfaces via the callbacks. Data stays fresh through `useActiveEvening`'s SSE + polling.
 */
import {useT} from '@/i18n'
import type {Evening} from '@/types.ts'
import {currentGameState, buildEventFeed, eveningTotals} from '@/lib/liveEvening.ts'
import {useThrowTracking} from '@/hooks/useClub.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

/** Compact relative time: "gerade eben", "vor N min", "vor N h", else clock time. */
function relTime(ts: number, now: number, t: (k: 'live.now') => string): string {
    const diff = Math.max(0, now - ts)
    const min = Math.floor(diff / 60000)
    if (min < 1) return t('live.now')
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    if (h < 12) return `${h} h`
    return new Date(ts).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

interface Props {
    evening: Evening
    onQuickEntry?: () => void
    onGoHighlights: () => void
    onGoGames: () => void
}

export function LiveEveningView({evening, onQuickEntry, onGoHighlights, onGoGames}: Props) {
    const t = useT()
    const throwTracking = useThrowTracking()
    const {game, activePlayer, nextPlayer, lastThrow} = currentGameState(evening)
    const feed = buildEventFeed(evening)
    const totals = eveningTotals(evening)
    const now = Date.now()

    return (
        <div className="page-scroll px-3 py-3 pb-24 space-y-3">
            {/* ── Scoreboard ── */}
            {game ? (
                <div className="kce-card p-4"
                     style={{background: 'color-mix(in srgb, var(--kce-primary) 10%, var(--kce-surface))'}}>
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-kce-muted truncate">{game.name}</div>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1"
                              style={{background: 'color-mix(in srgb, var(--kce-primary) 20%, transparent)', color: 'var(--kce-primary)'}}>
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background: 'var(--kce-primary)'}}/>
                            {t('live.running')}
                        </span>
                    </div>

                    <div className="flex items-end justify-between gap-3 mt-3">
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider">{t('live.onTurn')}</div>
                            <div className="font-display font-bold text-2xl text-kce-cream truncate">
                                {activePlayer ? (activePlayer.nickname || activePlayer.name) : '—'}
                            </div>
                            {nextPlayer && (
                                <div className="text-[11px] text-kce-muted mt-0.5 truncate">
                                    {t('live.next')}: {nextPlayer.nickname || nextPlayer.name}
                                </div>
                            )}
                        </div>
                        {throwTracking && lastThrow && (
                            <div className="text-right flex-shrink-0">
                                <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider">{t('live.lastThrow')}</div>
                                <div className="font-display font-bold text-3xl text-kce-primary leading-none">{lastThrow.pins}</div>
                                {lastThrow.cumulative != null && (
                                    <div className="text-[11px] text-kce-muted mt-0.5">Σ {lastThrow.cumulative}</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <button onClick={onGoGames}
                        className="w-full kce-card p-4 text-left active:scale-[0.99] transition-transform">
                    <div className="text-sm font-bold text-kce-cream">{t('live.noGame')}</div>
                    <div className="text-[11px] text-kce-muted mt-0.5">{t('live.noGameSub')}</div>
                </button>
            )}

            {/* ── Stat row ── */}
            <div className="grid grid-cols-4 gap-2">
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-kce-cream leading-tight">{fe(totals.penaltyEuro)}</div>
                    <div className="text-[10px] text-kce-muted">{t('live.stat.penalties')}</div>
                </div>
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-kce-cream leading-tight">🍺 {totals.beerRounds}</div>
                    <div className="text-[10px] text-kce-muted">{t('live.stat.beer')}</div>
                </div>
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-kce-cream leading-tight">🥃 {totals.shotRounds}</div>
                    <div className="text-[10px] text-kce-muted">{t('live.stat.shots')}</div>
                </div>
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-kce-cream leading-tight">{totals.gamesFinished}/{totals.gamesTotal}</div>
                    <div className="text-[10px] text-kce-muted">{t('nav.games')}</div>
                </div>
            </div>

            {/* ── Quick actions ── */}
            <div className="grid grid-cols-4 gap-2">
                <QuickAction emoji="🎯" label={t('live.action.penalty')} onClick={onQuickEntry}/>
                <QuickAction emoji="🍺" label={t('live.action.round')} onClick={onQuickEntry}/>
                <QuickAction emoji="✨" label={t('live.action.highlight')} onClick={onGoHighlights}/>
                <QuickAction emoji="🏆" label={t('nav.games')} onClick={onGoGames}/>
            </div>

            {/* ── Event ticker ── */}
            <div>
                <h2 className="text-xs font-extrabold text-kce-muted uppercase tracking-wider mb-1.5 px-0.5">{t('live.ticker')}</h2>
                {feed.length === 0 ? (
                    <div className="kce-card p-4 text-center text-xs text-kce-muted">{t('live.tickerEmpty')}</div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {feed.map(e => (
                            <div key={e.key} className="kce-card px-3 py-2 flex items-center gap-2.5">
                                <span className="text-lg flex-shrink-0">{e.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-kce-cream truncate">{e.title}</div>
                                    {e.subtitle && <div className="text-[11px] text-kce-muted truncate">{e.subtitle}</div>}
                                </div>
                                {e.amount != null && e.amount > 0 && (
                                    <span className="text-sm font-bold text-kce-primary flex-shrink-0">{fe(e.amount)}</span>
                                )}
                                <span className="text-[10px] text-kce-muted flex-shrink-0 w-14 text-right">{relTime(e.ts, now, t)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function QuickAction({emoji, label, onClick}: {emoji: string; label: string; onClick?: () => void}) {
    const disabled = !onClick
    return (
        <button onClick={onClick} disabled={disabled}
                className="kce-card p-3 flex flex-col items-center gap-1 active:scale-95 transition-transform disabled:opacity-40">
            <span className="text-xl leading-none">{emoji}</span>
            <span className="text-[11px] font-bold text-kce-cream text-center leading-tight">{label}</span>
        </button>
    )
}
