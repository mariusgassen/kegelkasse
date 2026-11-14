/**
 * Dynamic-Island-style live activity for the running evening (islandcn engine, `lib/island`).
 *
 * One activity while an evening is active: compact = 🎳 + running penalty total, expanded (long-press)
 * = venue, the running game / whose turn it is, and the headline totals. A tap opens the evening.
 * Subscribes to the same `['evening', id]` query the evening hub keeps fresh (SSE + polling) — no
 * second connection. The island itself is artwork: always black like the hardware, so its content
 * uses white + the raw accent (like the dark-only kiosk views), not the page-themed tokens.
 */
import {useEffect, useState} from 'react'
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

/** m:ss (or h:mm:ss) since an ISO start time; null when the start is unknown or unparsable. */
export function elapsedLabel(startedAt: string | null | undefined, now: number): string | null {
    if (!startedAt) return null
    const start = Date.parse(startedAt)
    if (Number.isNaN(start)) return null
    const total = Math.max(0, Math.floor((now - start) / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const sec = String(total % 60).padStart(2, '0')
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
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

    // Tick once a second, but only while a game with a known start is running.
    const [now, setNow] = useState(() => Date.now())
    const timed = !!game?.started_at
    useEffect(() => {
        if (!timed) return
        setNow(Date.now())
        const id = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(id)
    }, [timed])
    const timer = elapsedLabel(game?.started_at, now)

    const money = eur(totals.penaltyEuro)
    const gameLine = game
        ? [game.name, turnName, timer].filter(Boolean).join(' · ')
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
                // A running game shows its timer next to the evening total; otherwise just the total.
                trailing: (
                    <span style={{color: ACCENT, fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums'}}>
                        {timer ? `${timer} · ${money}` : money}
                    </span>
                ),
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
    }, [island, open, money, gameLine, venue, stats, timer, t])

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
