/**
 * Dynamic-Island-style live activity for the running evening (islandcn engine, `lib/island`).
 *
 * One activity while an evening is active: compact = 🎳 + running penalty total, expanded (long-press)
 * = venue, the running game / whose turn it is, and the headline totals. A tap opens the evening.
 * Subscribes to the same `['evening', id]` query the evening hub keeps fresh (SSE + polling) — no
 * second connection. The island itself is artwork: always black like the hardware, so its content
 * uses white + the raw accent (like the dark-only kiosk views), not the page-themed tokens.
 */
import {useEffect} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {router} from '@/router'
import {useT} from '@/i18n'
import {currentGameState, eveningTotals} from '@/lib/liveEvening.ts'
import {Island, IslandProvider, useIslandActions} from '@/lib/island'

const ACTIVITY_ID = 'evening'
const WHITE = 'white'
const ACCENT = 'var(--accent)'

function eur(v: number): string {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0})
}

function Activity({eveningId}: {eveningId: number}) {
    const t = useT()
    const island = useIslandActions()
    // Observe only — the evening hub owns fetching/SSE. `enabled: false` never triggers a request.
    const {data: evening} = useQuery({
        queryKey: ['evening', eveningId],
        queryFn: () => api.getEvening(eveningId),
        enabled: false,
    })

    const open = evening && !evening.is_closed ? evening : null
    const totals = eveningTotals(open)
    const {game, activePlayer} = currentGameState(open)
    const turnName = activePlayer ? (activePlayer.nickname || activePlayer.name) : null

    const money = eur(totals.penaltyEuro)
    const gameLine = game
        ? (turnName ? `${game.name} · ${turnName}` : game.name)
        : t('island.noGame')
    const venue = open?.venue || t('island.title')
    const stats = `${money} · 🍺 ${totals.beerRounds} · 🥃 ${totals.shotRounds}`

    useEffect(() => {
        if (!open) {
            island.end(ACTIVITY_ID)
            return
        }
        island.start({
            id: ACTIVITY_ID,
            label: t('island.label'),
            onPress: () => { router.navigate({to: '/evening'}).catch(() => {}) },
            compact: {
                leading: <span aria-hidden style={{fontSize: 16}}>🎳</span>,
                trailing: <span style={{color: ACCENT, fontWeight: 700, fontSize: 13}}>{money}</span>,
            },
            minimal: <span aria-hidden style={{fontSize: 14}}>🎳</span>,
            expanded: {
                leading: <span aria-hidden style={{fontSize: 22}}>🎳</span>,
                center: (
                    <div style={{color: WHITE, textAlign: 'center'}}>
                        <div style={{fontWeight: 700, fontSize: 15}}>{venue}</div>
                        <div style={{fontSize: 13, opacity: 0.8}}>{gameLine}</div>
                    </div>
                ),
                bottom: <div style={{color: ACCENT, fontWeight: 700, fontSize: 14, textAlign: 'center'}}>{stats}</div>,
            },
        })
    }, [island, open, money, gameLine, venue, stats, t])

    useEffect(() => () => island.end(ACTIVITY_ID), [island])

    return null
}

export default function EveningIsland({eveningId}: {eveningId: number}) {
    return (
        <IslandProvider>
            <Island placement="viewport" label="Live" backdrop="var(--canvas)"/>
            <Activity eveningId={eveningId}/>
        </IslandProvider>
    )
}
