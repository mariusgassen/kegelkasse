import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import type {Evening} from '@/types.ts'

const fe = (v: number) => new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(v)

/** Books (or re-books) the penalty for everyone who is not at the table this evening. */
export function AbsencePenalties({evening, onDone}: { evening: Evening; onDone: () => void }) {
    const t = useT()
    const qc = useQueryClient()
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<{ avg: number; absent_count: number } | null>(null)
    const booked = evening.penalty_log.some(l => l.player_id === null && l.penalty_type_name === 'Abwesenheit')

    async function calculate() {
        setLoading(true)
        try {
            const next = await api.calculateAbsencePenalties(evening.id)
            setResult(next)
            onDone()
            // The calculation books (and re-books) penalties, so the accounts move with it.
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            // Recalculating often changes nothing visible in the log (same absentees, same
            // amounts), so say out loud what happened instead of leaving the tap unanswered.
            if (next.absent_count > 0) {
                showToast(`🏠 ${next.absent_count} ${t('penalty.absence.result')} · Ø ${fe(next.avg)}`)
            } else {
                showToast(t('penalty.absence.none'), 'info')
            }
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <button
                type="button"
                className={`w-full min-h-8 py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-2 ${booked ? 'border-accent text-accent-fg bg-accent/10' : 'border-line text-muted'}`}
                onClick={calculate}
                disabled={loading}>
                🏠 {loading
                    ? t('action.loading')
                    : booked ? t('penalty.absence.recalculate') : t('penalty.absence.calculate')}
            </button>
            {result && !loading && (
                <p className="text-xs text-muted text-center mt-1">
                    {result.absent_count > 0
                        ? `${result.absent_count} ${t('penalty.absence.result')} · Ø ${fe(result.avg)}`
                        : t('penalty.absence.none')}
                </p>
            )}
        </div>
    )
}
