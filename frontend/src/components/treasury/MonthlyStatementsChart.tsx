import {Bar, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {useT} from '@/i18n'
import {chartAnimation} from '@/lib/motion.ts'
import type {MonthStatement} from '@/lib/balanceHistory.ts'

// Tokens only (CLAUDE.md → Colors); `-fg` twins are the ones readable as chart marks.
const C = {positive: 'var(--positive-fg)', danger: 'var(--danger-fg)', accent: 'var(--accent-fg)', ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)', surface: 'var(--surface-2)'}
const TICK = {fill: C.muted, fontSize: 12}
const TIP = {
    contentStyle: {background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12, color: C.ink},
    labelStyle: {color: C.ink},
    itemStyle: {color: C.ink},
}

/** How many months the chart covers — a year reads at a glance, older months stay in the list. */
export const CHART_MONTHS = 12

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}
function feShort(v: number) {
    return Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('de-DE', {maximumFractionDigits: 1})}k` : String(Math.round(v))
}

/**
 * The month list as one picture: money in (up) and out (down) per month, with the closing balance
 * as a line. `statements` come newest first (as `monthlyStatements` returns them).
 */
export function MonthlyStatementsChart({statements}: { statements: MonthStatement[] }) {
    const t = useT()
    const data = statements.slice(0, CHART_MONTHS).reverse().map(m => ({
        label: new Date(m.start).toLocaleDateString('de-DE', {month: 'short'}),
        inflow: m.inflow,
        outflow: m.outflow,
        closing: m.closing,
    }))
    if (data.length < 2) return null
    const anim = chartAnimation()
    return (
        <div className="mb-3" data-testid="statements-chart" role="img" aria-label={t('treasury.statements.chart')}>
            <div style={{width: '100%', height: 180}}>
                <ResponsiveContainer>
                    <ComposedChart data={data} stackOffset="sign" margin={{top: 8, right: 4, bottom: 0, left: 0}}>
                        <XAxis dataKey="label" tick={TICK} stroke={C.line} interval="preserveStartEnd"/>
                        <YAxis tick={TICK} stroke={C.line} tickFormatter={feShort} width={40}/>
                        <ReferenceLine y={0} stroke={C.line}/>
                        <Tooltip {...TIP} formatter={(v) => fe(Number(v))} cursor={{fill: C.line, opacity: 0.3}}/>
                        <Bar dataKey="inflow" name={t('treasury.statements.inflow')} stackId="flow" fill={C.positive} radius={[3, 3, 0, 0]} {...anim}/>
                        <Bar dataKey="outflow" name={t('treasury.statements.outflow')} stackId="flow" fill={C.danger} radius={[0, 0, 3, 3]} {...anim}/>
                        <Line dataKey="closing" name={t('treasury.statements.closing')} type="monotone" stroke={C.accent} strokeWidth={2} dot={{r: 2.5, fill: C.accent}} {...anim}/>
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-1">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{background: C.positive}}/>{t('treasury.statements.inflow')}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{background: C.danger}}/>{t('treasury.statements.outflow')}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{background: C.accent}}/>{t('treasury.statements.closing')}</span>
            </div>
        </div>
    )
}
