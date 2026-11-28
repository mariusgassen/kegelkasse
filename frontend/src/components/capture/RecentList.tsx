import {useEffect, useState} from 'react'
import {X} from 'lucide-react'
import {useT} from '@/i18n'
import {FRESH_MS, type CaptureController} from '@/hooks/useCaptureController.ts'
import type {Evening, EveningPlayer} from '@/types.ts'
import {entryValue} from './captureView.ts'

interface RecentListProps {
    capture: CaptureController
    evening: Evening
    players: EveningPlayer[]
    displayName: (p: EveningPlayer) => string
    money: (amount: number) => string
    time: (ts: number) => string
    limit?: number
}

interface Row {
    key: string
    id: number
    kind: 'penalty' | 'drink'
    icon: string
    title: string
    detail: string
    ts: number
    /** Never announced to anyone, so one tap removes it. */
    quiet: boolean
}

/** The latest manual penalties and drink rounds of the evening, each removable. */
export function RecentList({capture, evening, players, displayName, money, time, limit = 12}: RecentListProps) {
    const t = useT()
    const [confirming, setConfirming] = useState<string | null>(null)

    // An unanswered "delete?" goes away again
    useEffect(() => {
        if (!confirming) return
        const timer = setTimeout(() => setConfirming(null), 4000)
        return () => clearTimeout(timer)
    }, [confirming])

    const rows: Row[] = [
        // Loser penalties belong to their game and absence entries have no player at the table
        ...evening.penalty_log.filter(l => l.player_id !== null && l.game_id === null).map<Row>(l => {
            const player = players.find(p => p.id === l.player_id)
            return {
                key: `p${l.id}`, id: l.id, kind: 'penalty', icon: l.icon,
                title: player ? displayName(player) : l.player_name,
                detail: `${l.penalty_type_name}${l.mode === 'count' && l.amount > 1 ? ` ×${l.amount}` : ''} · ${money(entryValue(l))}`,
                ts: l.client_timestamp, quiet: l.mode === 'count',
            }
        }),
        ...evening.drink_rounds.map<Row>(d => ({
            key: `d${d.id}`, id: d.id, kind: 'drink', icon: d.drink_type === 'beer' ? '🍺' : '🥃',
            title: t(d.drink_type === 'beer' ? 'capture.beerRound' : 'capture.shotsRound'),
            detail: `${d.participant_ids.length} ${t('capture.people')}`,
            ts: d.client_timestamp, quiet: true,
        })),
    ].sort((a, b) => b.ts - a.ts).slice(0, limit)

    if (!rows.length) return null

    function remove(row: Row) {
        const immediately = row.id < 0 || (row.quiet && Date.now() - row.ts < FRESH_MS)
        if (!immediately && confirming !== row.key) {
            setConfirming(row.key)
            return
        }
        setConfirming(null)
        capture.removeEntry(row.id, row.kind)
    }

    return (
        <div>
            <h3 className="mb-1 text-sm font-bold text-muted">{t('quickEntry.recent')}</h3>
            <ul>
                {rows.map(row => (
                    <li key={row.key} className="flex min-h-12 items-center gap-2 border-b border-line/70">
                        <span aria-hidden="true" className="text-lg">{row.icon}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{row.title}</span>
                            <span className="block truncate text-xs text-muted">
                                {row.detail} · {time(row.ts)}
                                {row.id < 0 && ` · ${t('sync.pendingBadge')}`}
                            </span>
                        </span>
                        {confirming === row.key ? (
                            <button type="button" onClick={() => remove(row)}
                                    className="min-h-11 flex-shrink-0 rounded-lg bg-danger-tint px-2 text-xs font-bold text-danger-tint-fg">
                                {t('capture.confirmDelete')}
                            </button>
                        ) : (
                            <button type="button" onClick={() => remove(row)}
                                    aria-label={`${t('capture.remove')}: ${row.title}, ${row.detail}`}
                                    className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg text-muted">
                                <X size={18} strokeWidth={2} aria-hidden="true"/>
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}
