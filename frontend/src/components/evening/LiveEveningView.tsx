/**
 * Live evening cockpit (#65, "Abend-Modus").
 *
 * The immersive default view while an evening is running: a live scoreboard header (running game,
 * whose turn it is, last throw), a headline stat row, thumb-sized quick actions, and a
 * chronological event ticker. Read-only over the active evening — all derivation lives in the
 * pure `lib/liveEvening.ts`; mutations go through the existing quick-entry / highlights / games
 * surfaces via the callbacks. Data stays fresh through `useActiveEvening`'s SSE + polling.
 */
import {Caption} from '@/components/ui/Caption.tsx'
import {useT} from '@/i18n'
import type {Evening} from '@/types.ts'
import {currentGameState, buildEventFeed, eveningTotals, gameStandings, penaltyCurve, penaltyRanking} from '@/lib/liveEvening.ts'
import {useThrowTracking} from '@/hooks/useClub.ts'
import {Area, AreaChart, ResponsiveContainer, YAxis} from 'recharts'
import {chartAnimation} from '@/lib/motion.ts'
import {ProportionBar} from '@/components/ui/ProportionBar.tsx'
import {CountUp} from '@/components/ui/CountUp.tsx'
import {EventTicker} from './EventTicker.tsx'
import {LiveRanking} from './LiveRanking.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
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
    const feed = buildEventFeed(evening, {throws: throwTracking, t})
    const totals = eveningTotals(evening)
    const ranking = penaltyRanking(evening)
    const curve = penaltyCurve(evening)
    const standings = throwTracking ? gameStandings(evening, game) : []
    const standingsMax = standings.reduce((m, r) => Math.max(m, r.pins), 0)

    return (
        <div className="page-scroll px-3 py-3 pb-24 space-y-3">
            {/* ── Scoreboard ── */}
            {game ? (
                <div className="kce-card p-4"
                     style={{background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))'}}>
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-muted truncate">{game.name}</div>
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1"
                              style={{background: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent-fg)'}}>
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background: 'var(--accent)'}}/>
                            {t('live.running')}
                        </span>
                    </div>

                    {throwTracking && (
                        <div className="flex items-end justify-between gap-3 mt-3">
                            <div className="min-w-0">
                                <Caption>{t('live.onTurn')}</Caption>
                                <div className="font-display font-bold text-2xl text-ink truncate">
                                    {activePlayer ? (activePlayer.nickname || activePlayer.name) : '—'}
                                </div>
                                {nextPlayer && (
                                    <div className="text-sm text-muted mt-0.5 truncate">
                                        {t('live.next')}: {nextPlayer.nickname || nextPlayer.name}
                                    </div>
                                )}
                            </div>
                            {lastThrow && (
                                <div className="text-right flex-shrink-0">
                                    <Caption>{t('live.lastThrow')}</Caption>
                                    <div className="font-display font-bold text-3xl text-accent-fg leading-none">{lastThrow.pins}</div>
                                    {lastThrow.cumulative != null && (
                                        <div className="text-sm text-muted mt-0.5">Σ {lastThrow.cumulative}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {standings.length > 0 && standingsMax > 0 && (
                        <div className="mt-3 space-y-1.5" data-testid="live-standings">
                            <Caption>{t('live.standings')}</Caption>
                            {standings.map(r => (
                                <div key={r.key} data-testid={`live-standing-${r.key}`}>
                                    <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="truncate font-bold text-ink">{r.name}</span>
                                        <span className="font-bold text-ink tabular-nums">{r.pins}</span>
                                    </div>
                                    <ProportionBar segments={[{key: 'pins', value: r.pins, color: 'var(--accent)'}]}
                                                   total={standingsMax} height={6}
                                                   ariaLabel={t('live.pins').replace('{n}', String(r.pins))}/>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <button onClick={onGoGames}
                        className="w-full kce-card p-4 text-left active:scale-[0.99] transition-transform">
                    <div className="text-sm font-bold text-ink">{t('live.noGame')}</div>
                    <div className="text-sm text-muted mt-0.5">{t('live.noGameSub')}</div>
                </button>
            )}

            {/* ── Stat row ── */}
            <div className="grid grid-cols-4 gap-2">
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-ink leading-tight">
                        <CountUp value={totals.penaltyEuro} format={fe}/>
                    </div>
                    <div className="text-xs text-muted">{t('live.stat.penalties')}</div>
                    {curve.length >= 3 && (
                        <div className="mt-1" style={{width: '100%', height: 24}}
                             role="img" aria-label={t('live.curve')} data-testid="live-curve">
                            <ResponsiveContainer>
                                <AreaChart data={curve} margin={{top: 1, right: 0, bottom: 1, left: 0}}>
                                    <YAxis hide domain={[0, 'dataMax']}/>
                                    <Area type="stepAfter" dataKey="euro" stroke="var(--accent-fg)" strokeWidth={1.5}
                                          fill="var(--accent)" fillOpacity={0.15} dot={false} {...chartAnimation()}/>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-ink leading-tight">🍺 {totals.beerRounds}</div>
                    <div className="text-xs text-muted">{t('live.stat.beer')}</div>
                </div>
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-ink leading-tight">🥃 {totals.shotRounds}</div>
                    <div className="text-xs text-muted">{t('live.stat.shots')}</div>
                </div>
                <div className="kce-card p-2.5 text-center">
                    <div className="font-display font-bold text-base text-ink leading-tight">{totals.gamesFinished}/{totals.gamesTotal}</div>
                    <div className="text-xs text-muted">{t('nav.games')}</div>
                </div>
            </div>

            {/* ── Quick actions ── */}
            <div className="grid grid-cols-4 gap-2">
                <QuickAction emoji="🎯" label={t('live.action.penalty')} onClick={onQuickEntry}/>
                <QuickAction emoji="🍺" label={t('live.action.round')} onClick={onQuickEntry}/>
                <QuickAction emoji="✨" label={t('live.action.highlight')} onClick={onGoHighlights}/>
                <QuickAction emoji="🏆" label={t('nav.games')} onClick={onGoGames}/>
            </div>

            <LiveRanking rows={ranking} format={fe}/>

            {/* ── Event ticker ── */}
            <div>
                <h2 className="text-xs font-extrabold text-muted uppercase tracking-wider mb-1.5 px-0.5">{t('live.ticker')}</h2>
                <EventTicker events={feed}/>
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
            <span className="text-sm font-bold text-ink text-center leading-tight">{label}</span>
        </button>
    )
}
