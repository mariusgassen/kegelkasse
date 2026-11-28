import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {router} from '@/router'
import {Button} from '@/components/ui/Button.tsx'
import {currentGameState, eveningTotals} from '@/lib/liveEvening.ts'
import {useThrowTracking} from '@/hooks/useClub.ts'

const money = (v: number) => new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(v)

/** The new design's start page opens on the running evening: what it adds up to and who is throwing. */
export function LiveEveningHero({eveningId}: { eveningId: number }) {
    const t = useT()
    const throwTracking = useThrowTracking()
    // Same cache entry as the evening pages, which keep it live; an offline-created evening has none
    const {data: evening} = useQuery({
        queryKey: ['evening', eveningId],
        queryFn: () => api.getEvening(eveningId),
        enabled: eveningId > 0,
        staleTime: 15000,
    })
    const {game, activePlayer} = currentGameState(evening ?? null)
    const facts = evening ? [
        `${evening.players.length} ${t('capture.people')}`,
        `${evening.penalty_log.length} ${t('capture.penalties')}`,
        game?.name,
        throwTracking && activePlayer ? `${t('quickEntry.currentPlayer')} ${activePlayer.nickname || activePlayer.name}` : null,
    ].filter(Boolean).join(' · ') : t('home.eveningLive.sub')

    return (
        <section className="border-b border-line pb-4" data-testid="live-hero">
            <p className="flex items-center gap-2 text-sm font-bold text-positive-fg">
                <span className="h-2 w-2 rounded-full bg-positive" aria-hidden="true"/>
                {t('home.eveningLive.title')}
            </p>
            {evening && <p className="mt-1 font-display text-4xl font-bold">{money(eveningTotals(evening).penaltyEuro)}</p>}
            <p className="mt-1 mb-3 text-sm text-muted">{facts}</p>
            <Button variant="primary" block className="!min-h-12"
                    onClick={() => { router.navigate({to: '/evening', search: {tab: 'penalties'}}).catch(() => {}) }}>
                {t('home.openEvening')}
            </Button>
        </section>
    )
}
