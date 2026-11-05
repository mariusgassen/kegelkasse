import {useState} from 'react'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {useAiEnabled} from '@/hooks/useAiEnabled.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {toastError} from '@/utils/error.ts'
import type {BookingFlag, BookingFlagSeverity, BookingReview} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string) {
    return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})
}

const SEVERITY_CLASS: Record<BookingFlagSeverity, string> = {
    high: 'bg-danger-tint text-danger-tint-fg',
    medium: 'bg-accent-tint text-accent-tint-fg',
    low: 'bg-surface-2 text-muted',
}

function FlagRow({flag}: { flag: BookingFlag }) {
    const t = useT()
    let detail: string | null = null
    if (flag.kind === 'duplicate' && flag.detail.days_apart !== undefined) {
        detail = t('ai.review.detail.duplicate').replace('{days}', String(flag.detail.days_apart))
    } else if (flag.kind === 'unusual_amount' && flag.detail.median !== undefined) {
        detail = t('ai.review.detail.unusual')
            .replace('{factor}', String(flag.detail.factor))
            .replace('{median}', fe(flag.detail.median))
    }
    return (
        <div className="py-2 border-b border-line last:border-b-0" data-testid="booking-flag">
            <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEVERITY_CLASS[flag.severity]}`}>
                    {t(`ai.review.severity.${flag.severity}`)}
                </span>
                <span className="text-sm font-bold text-ink">{t(`ai.review.kind.${flag.kind}`)}</span>
            </div>
            {detail && <div className="text-xs text-muted mb-1">{detail}</div>}
            {flag.bookings.map(b => (
                <div key={`${b.kind}-${b.id}`} className="flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink">
                        {b.kind === 'expense' ? '🧾 ' : '👤 '}{b.label || '—'}
                        <span className="text-muted"> · {fDate(b.date)}{b.note ? ` · ${b.note}` : ''}</span>
                    </span>
                    <span className={`font-bold flex-shrink-0 ${b.amount >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                        {fe(b.amount)}
                    </span>
                </div>
            ))}
            {flag.ai_note && <div className="text-sm text-muted mt-1">✨ {flag.ai_note}</div>}
        </div>
    )
}

/**
 * Pre-audit check over the treasury bookings of a period (admins and Kassenprüfer). The rule-based findings work
 * without any AI; when a Claude key is configured the server adds a short note per finding and
 * a summary for the Kassenprüfer.
 */
export function BookingReviewCard({initialStart, initialEnd}: { initialStart?: string; initialEnd?: string } = {}) {
    const t = useT()
    const aiEnabled = useAiEnabled('booking_review')
    const online = useOnline()
    const year = new Date().getFullYear()
    const [start, setStart] = useState(initialStart?.slice(0, 10) ?? `${year}-01-01`)
    const [end, setEnd] = useState(initialEnd?.slice(0, 10) ?? `${year}-12-31`)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<BookingReview | null>(null)

    async function run() {
        setLoading(true)
        try {
            setResult(await api.aiBookingReview({start, end, explain: aiEnabled}))
        } catch (e) {
            toastError(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div data-testid="booking-review">
        <ExpandableCard title={<span className="text-sm font-bold">{t('ai.review.title')}</span>} className="mb-3">
            <p className="text-xs text-muted mb-2">
                {t('ai.review.hint')}{aiEnabled ? ` ${t('ai.review.hintAi')}` : ''}
            </p>
            <div className="flex gap-2 mb-2">
                <div className="flex-1">
                    <label className="field-label" htmlFor="review-start">{t('ai.review.from')}</label>
                    <input id="review-start" type="date" className="kce-input" value={start}
                           onChange={e => setStart(e.target.value)}/>
                </div>
                <div className="flex-1">
                    <label className="field-label" htmlFor="review-end">{t('ai.review.to')}</label>
                    <input id="review-end" type="date" className="kce-input" value={end}
                           onChange={e => setEnd(e.target.value)}/>
                </div>
            </div>
            <button type="button" className="btn-primary btn-sm w-full mb-2" onClick={run}
                    disabled={loading || !online || !start || !end}>
                {loading ? t('ai.review.running') : t('ai.review.run')}
            </button>
            {result && (
                result.flags.length === 0
                    ? <p className="text-sm text-muted">{t('ai.review.clean').replace('{n}', String(result.booking_count))}</p>
                    : <div>
                        <p className="text-xs text-muted mb-1">
                            {t('ai.review.count')
                                .replace('{flags}', String(result.flags.length))
                                .replace('{n}', String(result.booking_count))}
                        </p>
                        {result.summary && (
                            <div className="bg-surface-2 rounded-xl p-2 mb-2" data-testid="booking-review-summary">
                                <div className="field-label">✨ {t('ai.review.summary')}</div>
                                <p className="text-sm text-ink">{result.summary}</p>
                            </div>
                        )}
                        {result.flags.map(f => <FlagRow key={f.id} flag={f}/>)}
                    </div>
            )}
        </ExpandableCard>
        </div>
    )
}
