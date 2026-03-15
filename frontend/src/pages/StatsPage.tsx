import {useActiveEvening} from '../hooks/useEvening'
import {useQuery} from '@tanstack/react-query'
import {api} from '../api/client'
import {useT} from '@/i18n'
import {Empty} from '@/components/ui/Empty.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function StatsPage() {
    const {evening} = useActiveEvening()
    const t = useT()
    const year = new Date().getFullYear()

    const {data: yearStats} = useQuery({
        queryKey: ['stats', year],
        queryFn: () => api.getYearStats(year),
        staleTime: 1000 * 60 * 5,
    })

    // ── Evening analysis ──
    const eveningStats = evening ? computeEveningStats(evening) : null

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">{t('stats.title')}</div>

            <div className="sec-heading text-sm">{t('stats.evening')}</div>
            {!evening || !eveningStats ? (
                <Empty icon="📊" text={t('stats.noData')}/>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <StatBox value={fe(eveningStats.totalEuro)} label={t('stats.title')}/>
                        <StatBox value={String(eveningStats.penaltyCount)} label="Strafen"/>
                        <StatBox value={String(eveningStats.beerRounds)}
                                 label={t('treasury.drinks').replace('🍺 ', '')}/>
                        <StatBox value={String(eveningStats.shotRounds)} label="Schnapsrunden"/>
                    </div>

                    <div className="text-xs font-extrabold text-kce-muted uppercase mb-2">{t('stats.hof')}</div>
                    {eveningStats.hallOfFame.map((h, i) => (
                        <div key={i} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <span className="text-2xl">{h.icon}</span>
                            <div className="flex-1">
                                <div className="text-xs font-bold text-kce-muted">{h.label}</div>
                                <div className="text-sm font-bold">{h.name}</div>
                            </div>
                            <div className="text-kce-amber font-bold text-sm">{h.value}</div>
                        </div>
                    ))}
                </>
            )}

            <div className="sec-heading text-sm mt-4">
                {t('stats.year')} <span className="text-kce-muted text-xs">{year}</span>
            </div>
            {!yearStats ? (
                <Empty icon="📅" text={`${t('stats.noYearData')} ${year}`}/>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <StatBox value={String(yearStats.evening_count)} label="Abende"/>
                        <StatBox value={fe(yearStats.total_penalties)} label="Strafen gesamt"/>
                    </div>
                    <div className="text-xs font-extrabold text-kce-muted uppercase mb-2">Jahres-Strafenkasse</div>
                    {yearStats.players.slice(0, 5).map((p: any, i: number) => {
                        const colors = [{bg: '#e8a020', tc: '#0a0600'}, {bg: '#909090', tc: '#fff'}, {
                            bg: '#b07030',
                            tc: '#fff'
                        }]
                        const c = colors[i] || {bg: '#3d2e28', tc: '#b88840'}
                        return (
                            <div key={i} className="kce-card p-3 mb-2 flex items-center gap-3">
                                <div
                                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
                                    style={{background: c.bg, color: c.tc}}>{i + 1}</div>
                                <div className="flex-1">
                                    <div className="text-sm font-bold">{p.name}</div>
                                    <div className="text-xs text-kce-muted">{p.evenings} Abende</div>
                                </div>
                                <div className="text-red-400 font-bold text-sm">{fe(p.penalty_total)}</div>
                            </div>
                        )
                    })}
                </>
            )}

            {/* Player stats cards */}
            {evening && evening.players.length > 0 && (
                <>
                    <div className="sec-heading text-sm mt-4">🃏 Spieler-Karten</div>
                    <div className="grid grid-cols-2 gap-2">
                        {evening.players.map(p => {
                            const pTotal = evening.penalty_log.filter(l => l.player_id === p.id && l.mode === 'euro').reduce((s, l) => s + l.amount, 0)
                            const beerC = evening.drink_rounds.filter(r => r.drink_type === 'beer' && r.participant_ids.includes(p.id)).length
                            const wins = evening.games.filter(g => g.winner_ref === `p:${p.id}`).length
                            return (
                                <div key={p.id} className="kce-card p-3">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-kce-bg text-sm mb-2"
                                        style={{
                                            background: 'linear-gradient(135deg,#c4701a,#e8a020)',
                                            margin: '0 auto'
                                        }}>
                                        {p.name[0].toUpperCase()}
                                    </div>
                                    <div className="text-center text-xs font-bold mb-2 truncate">{p.name}</div>
                                    <div className="flex justify-around text-center">
                                        <div>
                                            <div className="text-kce-amber font-bold text-sm">{wins}</div>
                                            <div className="text-[9px] text-kce-muted">Siege</div>
                                        </div>
                                        <div>
                                            <div className="text-red-400 font-bold text-sm">{fe(pTotal)}</div>
                                            <div className="text-[9px] text-kce-muted">Strafen</div>
                                        </div>
                                        <div>
                                            <div className="text-kce-amber font-bold text-sm">🍺{beerC}</div>
                                            <div className="text-[9px] text-kce-muted">Bier</div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}

function StatBox({value, label}: { value: string; label: string }) {
    return (
        <div className="kce-card p-3 text-center">
            <div className="font-display font-bold text-kce-amber text-xl leading-tight">{value}</div>
            <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{label}</div>
        </div>
    )
}

function computeEveningStats(evening: NonNullable<ReturnType<typeof useActiveEvening>["evening"]>) {
    const totalEuro = evening.penalty_log.filter(l => l.mode === 'euro').reduce((s, l) => s + l.amount, 0)
    const penaltyCount = evening.penalty_log.length
    const beerRounds = evening.drink_rounds.filter(r => r.drink_type === 'beer').length
    const shotRounds = evening.drink_rounds.filter(r => r.drink_type === 'shots').length

    const byPlayer = (fn: (pid: number) => number) =>
        [...evening.players].sort((a, b) => fn(b.id) - fn(a.id))[0]

    const strafenTotal = (pid: number) => evening.penalty_log.filter(l => l.player_id === pid && l.mode === 'euro').reduce((s, l) => s + l.amount, 0)
    const beerCount = (pid: number) => evening.drink_rounds.filter(r => r.drink_type === 'beer' && r.participant_ids.includes(pid)).length
    const shotCount = (pid: number) => evening.drink_rounds.filter(r => r.drink_type === 'shots' && r.participant_ids.includes(pid)).length
    const nullCount = (pid: number) => evening.penalty_log.filter(l => l.player_id === pid && l.penalty_type_name.toLowerCase().includes('null')).length

    const topStrafen = byPlayer(strafenTotal)
    const topBeer = byPlayer(beerCount)
    const topShots = byPlayer(shotCount)
    const topNull = byPlayer(nullCount)
    const cleanest = [...evening.players].sort((a, b) => strafenTotal(a.id) - strafenTotal(b.id))[0]

    const winnersMap: Record<string, number> = {}
    evening.games.forEach(g => {
        if (g.winner_name) winnersMap[g.winner_name] = (winnersMap[g.winner_name] || 0) + 1
    })
    const topWinner = Object.entries(winnersMap).sort((a, b) => b[1] - a[1])[0]

    const hof = [
        topStrafen && strafenTotal(topStrafen.id) > 0 && {
            icon: '🤑',
            label: 'Strafenkaiser',
            name: topStrafen.name,
            value: fe(strafenTotal(topStrafen.id))
        },
        topNull && nullCount(topNull.id) > 0 && {
            icon: '🚫',
            label: 'Nullen-König',
            name: topNull.name,
            value: nullCount(topNull.id) + ' Nullen'
        },
        topBeer && beerCount(topBeer.id) > 0 && {
            icon: '🍺',
            label: 'Bier-Champ',
            name: topBeer.name,
            value: beerCount(topBeer.id) + ' Runden'
        },
        topShots && shotCount(topShots.id) > 0 && {
            icon: '🥃',
            label: 'Schnapsnase',
            name: topShots.name,
            value: shotCount(topShots.id) + ' Runden'
        },
        topWinner && {icon: '🏆', label: 'Spiele-König', name: topWinner[0], value: topWinner[1] + ' Siege'},
        cleanest && strafenTotal(cleanest.id) === 0 && {
            icon: '😇',
            label: 'Sauberster',
            name: cleanest.name,
            value: 'Keine Strafe!'
        },
    ].filter(Boolean) as { icon: string; label: string; name: string; value: string }[]

    return {totalEuro, penaltyCount, beerRounds, shotRounds, hallOfFame: hof}
}
