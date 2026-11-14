import {useLayoutEffect, useRef} from 'react'
import {useT} from '@/i18n'
import {useAppStore} from '@/store/app.ts'
import {DURATION, EASING, prefersReducedMotion} from '@/lib/motion.ts'
import type {RankingRow} from '@/lib/liveEvening.ts'
import {ProportionBar} from '@/components/ui/ProportionBar.tsx'
import {CountUp} from '@/components/ui/CountUp.tsx'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'

/**
 * Tonight's penalty ranking as bars on a shared scale (top player = full bar). When a booking
 * changes the order, rows slide to their new place (FLIP) instead of jumping, so it is visible
 * who just overtook whom.
 */
export function LiveRanking({rows, format}: { rows: RankingRow[]; format: (v: number) => string }) {
    const t = useT()
    const myId = useAppStore(s => s.user?.regular_member_id ?? null)
    const refs = useRef(new Map<number, HTMLLIElement>())
    const prevTop = useRef(new Map<number, number>())

    useLayoutEffect(() => {
        const next = new Map<number, number>()
        refs.current.forEach((el, id) => next.set(id, el.getBoundingClientRect().top))
        if (!prefersReducedMotion()) {
            next.forEach((top, id) => {
                const old = prevTop.current.get(id)
                const el = refs.current.get(id)
                if (old != null && old !== top && el?.animate) {
                    el.animate(
                        [{transform: `translateY(${old - top}px)`}, {transform: 'translateY(0)'}],
                        {duration: DURATION.slow, easing: EASING.standard},
                    )
                }
            })
        }
        prevTop.current = next
    }, [rows])

    const max = rows.reduce((m, r) => Math.max(m, r.euro), 0)
    if (rows.length === 0 || max <= 0) return null

    return (
        <section data-testid="live-ranking">
            <h2 className="text-xs font-extrabold text-muted uppercase tracking-wider mb-1.5 px-0.5">{t('live.ranking')}</h2>
            <ol className="kce-card p-3 space-y-2">
                {rows.map((r, i) => (
                    <li key={r.player.id}
                        ref={el => { if (el) refs.current.set(r.player.id, el); else refs.current.delete(r.player.id) }}
                        data-testid={`live-rank-${r.player.id}`}>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="w-5 text-right text-muted font-bold">{i + 1}.</span>
                            {r.player.is_king && <span role="img" aria-label={t('recap.king')}>👑</span>}
                            <span className="flex-1 min-w-0 truncate font-bold text-ink">{r.player.nickname || r.player.name}</span>
                            {myId != null && r.player.regular_member_id === myId && <MeBadge/>}
                            <CountUp value={r.euro} format={format} className="font-bold text-ink tabular-nums"/>
                        </div>
                        <div className="pl-7 mt-1">
                            <ProportionBar segments={[{key: 'penalty', value: r.euro, color: 'var(--accent)'}]}
                                           total={max} height={6} ariaLabel=""
                                           data-testid={`live-rank-bar-${r.player.id}`}/>
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    )
}
