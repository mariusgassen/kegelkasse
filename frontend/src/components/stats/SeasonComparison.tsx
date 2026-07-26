/**
 * 📊 Saison-Vergleich — one row per season, derived from the `seasons` rollup of
 * `GET /stats/records` (#68).
 *
 * The rollup is computed from evenings rather than only from `season_snapshot` rows, so the
 * comparison also works for clubs that have never run a season close (#39); seasons that *were*
 * closed are marked with their close date from the snapshot.
 */
import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {Empty} from '@/components/ui/Empty.tsx'
import {Loading} from '@/components/ui/Loading.tsx'
import {mergeSeasons, seasonPenaltyPerEvening} from '@/lib/statsLab.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function SeasonComparison({selectedYear, onSelectYear}: {
    selectedYear?: number
    onSelectYear?: (year: number) => void
}) {
    const t = useT()
    const {data, isLoading} = useQuery({
        queryKey: ['stats-records'],
        queryFn: api.getClubRecords,
        staleTime: 1000 * 60 * 5,
    })
    const {data: snapshots = []} = useQuery({
        queryKey: ['season-snapshots'],
        queryFn: api.listSeasonSnapshots,
        staleTime: 1000 * 60 * 5,
    })

    if (isLoading && !data) return <Loading className="py-6"/>

    const seasons = mergeSeasons(data?.seasons ?? [], snapshots)
    if (seasons.length === 0) return <Empty icon="📊" text={t('stats.seasons.empty')}/>

    const maxPenalty = Math.max(...seasons.map(s => s.penalty_total), 0.01)

    return (
        <div className="mb-4" data-testid="season-comparison">
            {seasons.map(s => (
                <button key={s.year} type="button"
                        data-testid={`season-row-${s.year}`}
                        className={`kce-card p-3 mb-2 w-full text-left active:opacity-70 transition-opacity ${s.year === selectedYear ? 'ring-1 ring-accent/40' : ''}`}
                        onClick={() => onSelectYear?.(s.year)}>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-display font-bold text-base flex-shrink-0">{s.year}</span>
                        {s.season_closed && (
                            <span className="text-xs text-muted font-bold">
                                ✅ {t('stats.seasons.closed')}
                            </span>
                        )}
                        <div className="flex-1"/>
                        <span className="text-accent-fg font-bold text-sm flex-shrink-0">
                            {fe(s.penalty_total)}
                        </span>
                    </div>
                    <div className="text-xs text-muted mb-1.5">
                        {s.evening_count} {t('stats.evenings')} · {s.player_count} {t('stats.seasons.players')}
                        {' · '}🍻 {s.drink_count} · ⌀ {fe(seasonPenaltyPerEvening(s))}/{t('stats.seasons.perEvening')}
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{background: 'var(--surface-2)'}}>
                        <div className="h-full rounded-full transition-all"
                             style={{
                                 width: `${(s.penalty_total / maxPenalty) * 100}%`,
                                 background: s.year === selectedYear ? 'var(--accent)' : 'var(--muted)',
                             }}/>
                    </div>
                </button>
            ))}
        </div>
    )
}
