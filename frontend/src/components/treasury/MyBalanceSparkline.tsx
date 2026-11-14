import {useQuery} from '@tanstack/react-query'
import {Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis} from 'recharts'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {chartAnimation} from '@/lib/motion.ts'
import {memberPaymentEvents, memberPenaltyEvents} from '@/lib/balanceHistory.ts'
import {runningBalance} from '@/lib/treasuryBars.ts'

/**
 * A small line of the member's own balance over time (payments up, penalties down), so the
 * Mein-Konto card shows the direction of travel, not only today's number. Shares its query keys
 * with the account history, so opening that history costs no extra request.
 */
export function MyBalanceSparkline({memberId}: { memberId: number }) {
    const t = useT()
    const {data: payments = []} = useQuery({
        queryKey: ['member-payments', memberId],
        queryFn: () => api.getMemberPayments(memberId),
        staleTime: 1000 * 30,
    })
    const {data: penalties = []} = useQuery({
        queryKey: ['member-penalties', memberId],
        queryFn: () => api.getMemberPenalties(memberId),
        staleTime: 1000 * 30,
    })
    const points = runningBalance([...memberPaymentEvents(payments ?? []), ...memberPenaltyEvents(penalties ?? [])])
    if (points.length < 3) return null
    const last = points[points.length - 1].balance
    const color = last < -0.01 ? 'var(--danger-fg)' : 'var(--positive-fg)'
    return (
        <div className="mt-2" data-testid="my-balance-sparkline" role="img" aria-label={t('treasury.my.trend')}>
            <div className="text-xs text-muted mb-0.5">{t('treasury.my.trend')}</div>
            <div style={{width: '100%', height: 44}}>
                <ResponsiveContainer>
                    <AreaChart data={points} margin={{top: 2, right: 0, bottom: 2, left: 0}}>
                        <YAxis hide domain={['dataMin', 'dataMax']}/>
                        <ReferenceLine y={0} stroke="var(--line)" strokeDasharray="3 3"/>
                        <Area type="stepAfter" dataKey="balance" stroke={color} strokeWidth={2}
                              fill={color} fillOpacity={0.15} dot={false} {...chartAnimation()}/>
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
