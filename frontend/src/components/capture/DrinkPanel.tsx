import {useT} from '@/i18n'
import {Button} from '@/components/ui/Button.tsx'
import type {DrinkKind} from '@/hooks/useCaptureController.ts'
import type {DrinkRound} from '@/types.ts'

interface DrinkPanelProps {
    kind: DrinkKind
    onKind: (kind: DrinkKind) => void
    joining: number
    total: number
    onCancel: () => void
    onBook: () => void
    rounds: DrinkRound[]
    time: (ts: number) => string
}

/** One drink, many people: who joins is chosen on the player tiles, everyone by default. */
export function DrinkPanel({kind, onKind, joining, total, onCancel, onBook, rounds, time}: DrinkPanelProps) {
    const t = useT()
    const latest = [...rounds].sort((a, b) => b.client_timestamp - a.client_timestamp).slice(0, 6)
    const label = (k: DrinkKind) => (
        <><span aria-hidden="true">{k === 'beer' ? '🍺' : '🥃'}</span> {t(k === 'beer' ? 'drinks.beer' : 'drinks.shots')}</>
    )
    return (
        <section aria-label={t('drinks.title')}
                 className="my-auto flex min-w-0 flex-col items-center gap-3 p-4">
            <div className="kce-segment flex" role="group" aria-label={t('drinks.title')}>
                {(['beer', 'shots'] as const).map(k => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => onKind(k)}
                            className="!min-h-14 !min-w-36 !text-base font-extrabold">
                        {label(k)}
                    </button>
                ))}
            </div>
            <p className="font-display text-5xl font-bold" aria-live="polite">
                {joining} {t('capture.drinkOf')} {total}
            </p>
            <p className="text-muted">{t('capture.drinkHint')}</p>
            <div className="flex w-full max-w-lg gap-3">
                <Button type="button" variant="secondary" className="!min-h-14" onClick={onCancel}>
                    {t('action.cancel')}
                </Button>
                <Button type="button" variant="primary" className="!min-h-14 flex-1 !text-base" disabled={!joining} onClick={onBook}>
                    {t('capture.bookRound')} · {joining}
                </Button>
            </div>
            {latest.length > 0 && (
                <div className="w-full max-w-xs">
                    <h3 className="mb-1 mt-4 text-sm font-bold text-muted">{t('capture.roundsToday')}</h3>
                    <ul>
                        {latest.map(r => (
                            <li key={r.id} className="flex min-h-10 items-center justify-between border-b border-line/70 text-sm">
                                <span>{label(r.drink_type)} · {r.participant_ids.length}</span>
                                <span className="text-muted">{time(r.client_timestamp)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    )
}
