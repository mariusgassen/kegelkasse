/**
 * Live evening cockpit (#65, "Abend-Modus").
 *
 * The immersive default view while an evening is running: a live scoreboard header (running game,
 * whose turn it is, last throw), a headline stat row, thumb-sized quick actions, and a
 * chronological event ticker. Read-only over the active evening — all derivation lives in the
 * pure `lib/liveEvening.ts`; mutations go through the existing quick-entry / highlights / games
 * surfaces via the callbacks. Data stays fresh through `useActiveEvening`'s SSE + polling.
 */
import {useState} from 'react'
import {api} from '@/api/client.ts'
import {Button} from '@/components/ui/Button.tsx'
import {Caption} from '@/components/ui/Caption.tsx'
import {StatTile} from '@/components/ui/StatTile.tsx'
import {useT} from '@/i18n'
import {toastError} from '@/utils/error.ts'
import type {Evening} from '@/types.ts'
import {currentGameState, buildEventFeed, eveningTotals, gameStandings, penaltyCurve, penaltyRanking} from '@/lib/liveEvening.ts'
import {penaltyTypeCounts} from '@/lib/quickEntryVisuals.ts'
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
    onGoManage?: () => void
    onUpdated?: () => void
}

export function LiveEveningView({evening, onQuickEntry, onGoHighlights, onGoGames, onGoManage, onUpdated}: Props) {
    const t = useT()
    const throwTracking = useThrowTracking()
    const [teamBusy, setTeamBusy] = useState(false)
    const {game, activePlayer, nextPlayer, lastThrow} = currentGameState(evening)
    const feed = buildEventFeed(evening, {throws: throwTracking, limit: Infinity, t})
    const totals = eveningTotals(evening)
    const ranking = penaltyRanking(evening)
    const curve = penaltyCurve(evening)
    const standings = throwTracking ? gameStandings(evening, game) : []
    const standingsMax = standings.reduce((m, r) => Math.max(m, r.pins), 0)

    const unassignedPlayers = evening.players.filter(p => p.team_id === null)
    const showTeamSetup = !evening.is_closed && evening.players.length > 0 && (
        evening.teams.length === 0
        || unassignedPlayers.length > 0
        || (!game && totals.gamesFinished === 0)
    )
    const orderedPlayers = [...evening.players].sort((a, b) => {
        const aMissing = a.team_id === null ? 0 : 1
        const bMissing = b.team_id === null ? 0 : 1
        return aMissing - bMissing
    })

    async function applyTemplates(shuffle: boolean) {
        if (teamBusy) return
        setTeamBusy(true)
        try {
            await api.applyClubTeamsToEvening(evening.id, shuffle)
            onUpdated?.()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setTeamBusy(false)
        }
    }

    async function shuffleTeams() {
        if (teamBusy) return
        setTeamBusy(true)
        try {
            await api.shuffleTeamPlayers(evening.id)
            onUpdated?.()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setTeamBusy(false)
        }
    }

    async function assignPlayerTeam(playerId: number, teamId: number) {
        if (teamBusy) return
        setTeamBusy(true)
        try {
            await api.updatePlayer(evening.id, playerId, {team_id: teamId})
            onUpdated?.()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setTeamBusy(false)
        }
    }

    const counts = penaltyTypeCounts(evening.penalty_log)
    const typeIcons = new Map<string, string>()
    for (const p of evening.penalty_log) {
        if (!typeIcons.has(p.penalty_type_name) && p.icon) {
            typeIcons.set(p.penalty_type_name, p.icon)
        }
    }
    const sortedPenaltyCounts = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

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
                        data-testid="live-no-game-alert"
                        className="w-full rounded-xl p-4 text-left border border-danger/40 bg-danger-tint active:scale-[0.99] transition-transform flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-sm font-bold text-danger-tint-fg flex items-center gap-1.5">
                            <span aria-hidden="true">⚠️</span>
                            <span>{t('live.noGame')}</span>
                        </div>
                        <div className="text-sm text-muted mt-0.5">{t('live.noGameSub')}</div>
                    </div>
                    <span className="text-base font-bold text-danger-tint-fg flex-shrink-0" aria-hidden="true">→</span>
                </button>
            )}

            {/* ── Team selection right at the start of the evening (or when players are unassigned) ── */}
            {showTeamSetup && (
                <div
                    data-testid="live-team-setup"
                    className={[
                        'rounded-xl p-3.5 border space-y-2.5',
                        evening.teams.length === 0 || unassignedPlayers.length > 0
                            ? 'bg-danger-tint border-danger/35'
                            : 'kce-card border-line/60',
                    ].join(' ')}
                >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-extrabold text-ink uppercase tracking-wider">
                                🤝 {t('team.setup')}
                            </span>
                            {evening.teams.length > 0 && unassignedPlayers.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-danger/20 text-danger-fg">
                                    {t('team.unassignedBadge').replace('{n}', String(unassignedPlayers.length))}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {evening.teams.length > 0 && (
                                <Button
                                    variant="secondary"
                                    size="xs"
                                    disabled={teamBusy}
                                    onClick={shuffleTeams}
                                >
                                    🎲 {t('team.shuffle')}
                                </Button>
                            )}
                            {onGoManage && (
                                <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={onGoManage}
                                >
                                    {t('team.manage')}
                                </Button>
                            )}
                        </div>
                    </div>

                    {evening.teams.length === 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs text-muted">{t('team.applyPrompt')}</p>
                            <div className="flex flex-wrap gap-1.5">
                                <Button
                                    variant="secondary"
                                    size="xs"
                                    disabled={teamBusy}
                                    onClick={() => applyTemplates(false)}
                                >
                                    {t('team.fromTemplateBadge')}
                                </Button>
                                <Button
                                    variant="primary"
                                    size="xs"
                                    disabled={teamBusy}
                                    onClick={() => applyTemplates(true)}
                                >
                                    🎲 {t('team.randomizeShort')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <p className="text-xs text-muted">{t('team.pickHint')}</p>
                            {orderedPlayers.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-2 py-1 border-t border-line/40 first:border-t-0">
                                    <span className={[
                                        'text-sm font-semibold truncate',
                                        p.team_id === null ? 'text-danger-tint-fg' : 'text-ink',
                                    ].join(' ')}>
                                        {p.nickname || p.name}
                                    </span>
                                    <div className="flex flex-wrap justify-end gap-1">
                                        {evening.teams.map(tm => {
                                            const active = p.team_id === tm.id
                                            return (
                                                <button
                                                    key={tm.id}
                                                    type="button"
                                                    disabled={teamBusy}
                                                    onClick={() => assignPlayerTeam(p.id, tm.id)}
                                                    className={[
                                                        'px-2.5 py-1 rounded-full text-xs font-bold transition-colors',
                                                        active
                                                            ? 'bg-accent text-on-accent'
                                                            : 'bg-surface-2 text-muted hover:text-ink',
                                                    ].join(' ')}
                                                >
                                                    {tm.name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Stat row ── */}
            <div className="grid grid-cols-4 gap-2">
                <StatTile size="sm" value={<CountUp value={totals.penaltyEuro} format={fe}/>} label={t('live.stat.penalties')} tone="default"/>
                <StatTile size="sm" value={totals.beerRounds} label={t('live.stat.beer')} tone="default"/>
                <StatTile size="sm" value={totals.shotRounds} label={t('live.stat.shots')} tone="default"/>
                <StatTile size="sm" value={`${totals.gamesFinished}/${totals.gamesTotal}`} label={t('nav.games')} tone="default"/>
            </div>

            {curve.length >= 3 && (
                <div className="kce-card px-3 py-2" style={{width: '100%', height: 40}}
                     role="img" aria-label={t('live.curve')} data-testid="live-curve">
                    <ResponsiveContainer>
                        <AreaChart data={curve} margin={{top: 2, right: 0, bottom: 2, left: 0}}>
                            <YAxis hide domain={[0, 'dataMax']}/>
                            <Area type="stepAfter" dataKey="euro" stroke="var(--accent-fg)" strokeWidth={1.5}
                                  fill="var(--accent)" fillOpacity={0.15} dot={false} {...chartAnimation()}/>
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── Primary Quick Entry CTA + Quick actions ── */}
            <button type="button"
                    data-testid="live-quick-entry-cta"
                    onClick={onQuickEntry}
                    disabled={!onQuickEntry}
                    className="w-full rounded-xl px-4 py-3 bg-accent text-on-accent font-display font-extrabold text-sm flex items-center justify-between active:scale-[0.99] transition-transform disabled:opacity-40">
                <span className="flex items-center gap-2">
                    <span className="text-lg leading-none" aria-hidden="true">⚡</span>
                    <span>{t('quickEntry.open')}</span>
                </span>
                <span className="text-base leading-none" aria-hidden="true">→</span>
            </button>

            <div className="grid grid-cols-4 gap-2">
                <QuickAction emoji="🎯" label={t('live.action.penalty')} onClick={onQuickEntry}/>
                <QuickAction emoji="🍺" label={t('live.action.round')} onClick={onQuickEntry}/>
                <QuickAction emoji="✨" label={t('live.action.highlight')} onClick={onGoHighlights}/>
                <QuickAction emoji="🏆" label={t('nav.games')} onClick={onGoGames}/>
            </div>

            <LiveRanking rows={ranking} format={fe}/>

            {sortedPenaltyCounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5" data-testid="live-penalty-counts">
                    {sortedPenaltyCounts.map(([name, count]) => (
                        <span key={name}
                              data-testid={`live-penalty-count-${name}`}
                              className="kce-card px-2.5 py-1 inline-flex items-center gap-1.5 text-xs font-bold text-ink">
                            <span>{typeIcons.get(name) || '⚖️'} {name}</span>
                            <span className="px-1.5 py-0.5 rounded-full text-xs font-extrabold"
                                  style={{background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent-fg)'}}>
                                ×{count}
                            </span>
                        </span>
                    ))}
                </div>
            )}

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
