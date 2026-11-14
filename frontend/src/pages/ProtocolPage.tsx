import {Caption} from '@/components/ui/Caption.tsx'
import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {ChipSelect} from '@/components/ui/ChipSelect.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {EmojiPickerButton} from '@/components/ui/EmojiPickerButton.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {toDateTimeInput} from '@/lib/datetime.ts'
import {playSound} from '@/lib/soundboard'
import {sortPenaltyTypes} from '@/lib/penaltyTypes'
import {PenaltyPickButton} from '@/components/evening/PenaltyPickButton'
import {useAudioCallouts} from '@/hooks/useClub.ts'
import {parseAmount} from '@/utils/parse.ts'
import type {PenaltyLogEntry, PenaltyMode} from '@/types.ts'
import {PinBadges} from '@/components/ui/MemberBadges.tsx'
import {Button} from '@/components/ui/Button.tsx'
import {gameBandColor, gameBandIndex} from '@/lib/protocolTimeline.ts'
import {Field} from '@/components/ui/Field.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fTime(ms: number) {
    return new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

/** Amount input with € or × prefix, adapts step/placeholder to mode */
function AmountInput({mode, value, onChange, defaultAmount}: {
    mode: PenaltyMode
    value: string
    onChange: (v: string) => void
    defaultAmount?: number
}) {
    const t = useT()
    const isEuro = mode === 'euro'
    const label = isEuro
        ? (defaultAmount !== undefined ? `${t('penalty.amount.override')} (Standard: ${fe(defaultAmount)})` : t('penalty.amount'))
        : t('penalty.count.label')
    const placeholder = isEuro
        ? (defaultAmount !== undefined ? String(defaultAmount) : '0.00')
        : '1'
    return (
        <Field label={label}>
            <div className="flex items-center gap-2">
                <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">
                    {isEuro ? '€' : '×'}
                </span>
                <input className="kce-input flex-1"
                       type={isEuro ? 'text' : 'number'}
                       inputMode={isEuro ? 'decimal' : 'numeric'}
                       step={isEuro ? undefined : '1'}
                       min="0"
                       value={value}
                       placeholder={placeholder}
                       onChange={e => onChange(e.target.value)}/>
            </div>
        </Field>
    )
}

interface ProtocolPageProps {
    onQuickEntry?: () => void
}

export function ProtocolPage({onQuickEntry}: ProtocolPageProps) {
    const t = useT()
    const qc = useQueryClient()
    const {evening, invalidate, cancelPendingItem} = useActiveEvening()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const setPenaltyTypes = useAppStore(s => s.setPenaltyTypes)
    const regularMembers = useAppStore(s => s.regularMembers)
    const guestPenaltyCap = useAppStore(s => s.guestPenaltyCap)
    const user = useAppStore(s => s.user)
    const audioCallouts = useAudioCallouts()
    const {data: pins = []} = useQuery({queryKey: ['pins'], queryFn: api.listPins, staleTime: 60000})
    const [sheet, setSheet] = useState(false)
    const [tab, setTab] = useState<'quick' | 'custom'>('quick')

    // Quick form
    const [selectedType, setSelectedType] = useState<number | null>(null)
    const [playerIds, setPlayerIds] = useState<(number | string)[]>([])
    const [mode, setMode] = useState<PenaltyMode>('count')
    const [amount, setAmount] = useState('')

    // Custom form
    const [customIcon, setCustomIcon] = useState('⚠️')
    const [customName, setCustomName] = useState('')
    const [customAmount, setCustomAmount] = useState('')
    const [customMode, setCustomMode] = useState<PenaltyMode>('count')
    const [customUnitAmount, setCustomUnitAmount] = useState('')
    const [customPlayerIds, setCustomPlayerIds] = useState<(number | string)[]>([])
    const [saveAsTemplate, setSaveAsTemplate] = useState(false)

    const [saving, setSaving] = useState(false)

    // Drink sheet
    const [drinkSheet, setDrinkSheet] = useState(false)
    const [drinkType, setDrinkType] = useState<'beer' | 'shots'>('beer')
    const [drinkVariety, setDrinkVariety] = useState('')
    const [drinkPlayerIds, setDrinkPlayerIds] = useState<(number | string)[]>([])

    // Delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
    const [confirmDeleteDrinkId, setConfirmDeleteDrinkId] = useState<number | null>(null)

    // Filters
    const [filterPlayer, setFilterPlayer] = useState<number | null>(() => {
        const p = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?') + 1) : '').get('player')
        return p ? parseInt(p, 10) : null
    })
    const [filterGame, setFilterGame] = useState<number | null>(null)

    // Absence penalties
    const [absenceLoading, setAbsenceLoading] = useState(false)
    const [absenceResult, setAbsenceResult] = useState<{ avg: number; absent_count: number } | null>(null)

    // Edit sheet
    const [editEntry, setEditEntry] = useState<PenaltyLogEntry | null>(null)
    const [editTab, setEditTab] = useState<'quick' | 'custom'>('quick')
    const [editPlayerId, setEditPlayerId] = useState<number | null>(null)
    const [editType, setEditType] = useState<number | null>(null)
    const [editIcon, setEditIcon] = useState('⚠️')
    const [editName, setEditName] = useState('')
    const [editMode, setEditMode] = useState<PenaltyMode>('euro')
    const [editAmount, setEditAmount] = useState('')
    const [editDate, setEditDate] = useState('')

    if (!evening) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">📋 {t('evening.tab.log')}</div>
                <Empty icon="⚠️" text={t('evening.noActive')}/>
            </div>
        )
    }

    const players = evening.players
    const playerOptions = players.map(p => ({id: p.id, label: p.nickname || p.name}))

    // Per-player euro contribution (full uncapped)
    function entryEuroValue(l: typeof players[0] extends never ? never : {
        mode: string;
        amount: number;
        unit_amount: number | null;
        penalty_type_name: string
    }): number {
        if (l.mode === 'euro') return l.amount
        if (l.unit_amount != null) return l.amount * l.unit_amount
        const pt = penaltyTypes.find(pt => pt.name === l.penalty_type_name)
        return pt ? l.amount * pt.default_amount : 0
    }

    // Treasury total: group by player, cap guests, add absence entries at face value
    const euroTotal = (() => {
        // Absence entries (player_id = null): add directly, no cap
        let total = evening.penalty_log
            .filter(l => l.player_id === null)
            .reduce((s, l) => s + entryEuroValue(l), 0)

        // Present players: group, then cap guests
        const byPlayer = new Map<number, number>()
        for (const l of evening.penalty_log.filter(l => l.player_id !== null)) {
            byPlayer.set(l.player_id!, (byPlayer.get(l.player_id!) ?? 0) + entryEuroValue(l))
        }
        for (const [pid, sum] of byPlayer) {
            const player = players.find(p => p.id === pid)
            const member = regularMembers.find(m => m.id === player?.regular_member_id)
            const capped = member?.is_guest && guestPenaltyCap != null
                ? Math.min(sum, guestPenaltyCap)
                : sum
            total += capped
        }
        return total
    })()

    const selectedPenaltyType = penaltyTypes.find(pt => pt.id === selectedType)

    function openSheet() {
        setTab('quick')
        const first = penaltyTypes[0] ?? null
        setSelectedType(first?.id ?? null)
        setPlayerIds([])
        setMode('count')
        setAmount('1')
        setCustomIcon('⚠️')
        setCustomName('')
        setCustomAmount('1')
        setCustomMode('count')
        setCustomUnitAmount('')
        setCustomPlayerIds([])
        setSaveAsTemplate(false)
        setSheet(true)
    }

    function openDrinkSheet() {
        setDrinkType('beer')
        setDrinkVariety('')
        setDrinkPlayerIds(players.map(p => p.id))
        setDrinkSheet(true)
    }

    function openEditSheet(entry: PenaltyLogEntry) {
        setEditEntry(entry)
        setEditPlayerId(entry.player_id)
        const pt = penaltyTypes.find(pt => pt.name === entry.penalty_type_name)
        setEditType(pt?.id ?? null)
        setEditTab(pt ? 'quick' : 'custom')
        setEditIcon(entry.icon || '⚠️')
        setEditName(entry.penalty_type_name)
        setEditMode(entry.mode)
        setEditAmount(String(entry.amount))
        setEditDate(toDateTimeInput(entry.client_timestamp))
    }

    async function submitQuick() {
        if (!selectedPenaltyType || playerIds.length === 0) return
        const effectiveAmount = mode === 'count'
            ? (parseInt(amount) || 1)
            : (parseAmount(amount) || selectedPenaltyType.default_amount)
        setSaving(true)
        try {
            await api.addPenalty(evening!.id, {
                player_ids: playerIds as number[],
                penalty_type_name: selectedPenaltyType.name,
                icon: selectedPenaltyType.icon,
                amount: effectiveAmount,
                mode,
                unit_amount: mode === 'count' ? selectedPenaltyType.default_amount : undefined,
                client_timestamp: Date.now(),
            })
            if (audioCallouts) playSound(selectedPenaltyType.sound_key)
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            setSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function submitCustom() {
        if (!customName.trim() || customPlayerIds.length === 0) return
        const effectiveAmount = customMode === 'count'
            ? (parseInt(customAmount) || 1)
            : (parseAmount(customAmount) || 0)
        const effectiveUnitAmount = customMode === 'count' ? (parseAmount(customUnitAmount) || undefined) : undefined
        setSaving(true)
        try {
            await api.addPenalty(evening!.id, {
                player_ids: customPlayerIds as number[],
                penalty_type_name: customName,
                icon: customIcon,
                amount: effectiveAmount,
                mode: customMode,
                unit_amount: effectiveUnitAmount,
                client_timestamp: Date.now(),
            })
            if (saveAsTemplate) {
                const newPt = await api.createPenaltyType({
                    icon: customIcon,
                    name: customName,
                    default_amount: customMode === 'count' ? (effectiveUnitAmount ?? 0) : effectiveAmount,
                })
                setPenaltyTypes(sortPenaltyTypes([...penaltyTypes, newPt]))
                await qc.invalidateQueries({queryKey: ['penalty-types']})
            }
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            setSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function confirmDelete(lid: number) {
        try {
            if (lid < 0) {
                await cancelPendingItem(lid, 'penalty')
            } else {
                await api.deletePenalty(evening!.id, lid)
                invalidate()
                qc.invalidateQueries({queryKey: ['member-balances']})
                qc.invalidateQueries({queryKey: ['guest-balances']})
            }
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setConfirmDeleteId(null)
        }
    }

    async function confirmDeleteDrink(rid: number) {
        try {
            if (rid < 0) {
                await cancelPendingItem(rid, 'drink')
            } else {
                await api.deleteDrinkRound(evening!.id, rid)
                invalidate()
            }
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setConfirmDeleteDrinkId(null)
        }
    }

    async function submitEdit() {
        if (!editEntry) return
        const pt = penaltyTypes.find(p => p.id === editType)
        const patch: Parameters<typeof api.updatePenalty>[2] = {}
        if (editPlayerId !== editEntry.player_id) patch.player_id = editPlayerId ?? undefined
        if (editTab === 'custom') {
            const name = editName.trim()
            if (!name) return
            if (name !== editEntry.penalty_type_name) patch.penalty_type_name = name
            if (editIcon !== editEntry.icon) patch.icon = editIcon
        } else if (pt && pt.name !== editEntry.penalty_type_name) {
            patch.penalty_type_name = pt.name
            patch.icon = pt.icon
        }
        if (editMode !== editEntry.mode) patch.mode = editMode
        const newAmount = editMode === 'count'
            ? (parseInt(editAmount) || 1)
            : (parseAmount(editAmount) || (editTab === 'quick' ? pt?.default_amount ?? editEntry.amount : editEntry.amount))
        if (newAmount !== editEntry.amount) patch.amount = newAmount
        // Compare in local wall-clock; send timezone-aware ISO so the backend
        // (which treats naive strings as UTC) stores the intended local time
        const originalDate = toDateTimeInput(editEntry.client_timestamp)
        if (editDate && editDate !== originalDate) patch.date = new Date(editDate).toISOString()
        setSaving(true)
        try {
            await api.updatePenalty(evening!.id, editEntry.id, patch)
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            setEditEntry(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function doCalculateAbsence() {
        setAbsenceLoading(true)
        try {
            const result = await api.calculateAbsencePenalties(evening!.id)
            setAbsenceResult(result)
            invalidate()
            // The calculation books (and re-books) penalties, so the accounts move with it.
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            // Recalculating often changes nothing visible in the log (same absentees, same
            // amounts), so say out loud what happened instead of leaving the tap unanswered.
            if (result.absent_count > 0) {
                showToast(`🏠 ${result.absent_count} ${t('penalty.absence.result')} · Ø ${fe(result.avg)}`)
            } else {
                showToast(t('penalty.absence.none'), 'info')
            }
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setAbsenceLoading(false)
        }
    }

    const allLog = [...evening.penalty_log].reverse()
    const logByPlayer = filterPlayer !== null
        ? allLog.filter(l => l.player_id === filterPlayer)
        : allLog
    const log = filterGame !== null
        ? logByPlayer.filter(l => filterGame === -1 ? l.game_id === null : l.game_id === filterGame)
        : logByPlayer
    const isFiltered = filterPlayer !== null || filterGame !== null

    // Treasury-style total (grouped by player, guest-capped) but restricted to the filtered log
    const filteredEuroTotal = (() => {
        let total = log
            .filter(l => l.player_id === null)
            .reduce((s, l) => s + entryEuroValue(l), 0)
        const byPlayer = new Map<number, number>()
        for (const l of log.filter(l => l.player_id !== null)) {
            byPlayer.set(l.player_id!, (byPlayer.get(l.player_id!) ?? 0) + entryEuroValue(l))
        }
        for (const [pid, sum] of byPlayer) {
            const player = players.find(p => p.id === pid)
            const member = regularMembers.find(m => m.id === player?.regular_member_id)
            const capped = member?.is_guest && guestPenaltyCap != null
                ? Math.min(sum, guestPenaltyCap)
                : sum
            total += capped
        }
        return total
    })()

    // Games that have at least one associated penalty
    const gamesWithPenalties = evening.games.filter(g => evening.penalty_log.some(l => l.game_id === g.id))
    const hasManualPenalties = evening.penalty_log.some(l => l.game_id === null)
    const showGameFilter = gamesWithPenalties.length > 0
    const hasAbsenceEntries = evening.penalty_log.some(l => l.player_id === null && l.penalty_type_name === 'Abwesenheit')

    // Build merged timeline (only when no player filter active)
    type TimelineEvent =
        | { kind: 'penalty'; entry: typeof log[0]; ts: number }
        | { kind: 'game_started'; game: typeof evening.games[0]; ts: number; pending: boolean }
        | { kind: 'game_finished'; game: typeof evening.games[0]; ts: number; pending: boolean }

    const timeline: TimelineEvent[] = log.map(e => ({kind: 'penalty', entry: e, ts: e.client_timestamp}))

    if (filterPlayer === null) {
        for (const g of evening.games) {
            if (g.started_at) timeline.push({kind: 'game_started', game: g, ts: new Date(g.started_at).getTime(), pending: g.id < 0 || !!g._pendingStart})
            if (g.finished_at) timeline.push({kind: 'game_finished', game: g, ts: new Date(g.finished_at).getTime(), pending: g.id < 0 || !!g._pendingFinish})
        }
        timeline.sort((a, b) => b.ts - a.ts)
    }

    const drinkRounds = [...evening.drink_rounds].reverse()
    const editPenaltyType = penaltyTypes.find(pt => pt.id === editType)

    return (
        <div className="page-scroll px-3 py-3 pb-24">

            {/* ── Header: total + action buttons ── */}
            <div className="kce-card p-3 mb-3">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-extrabold text-muted uppercase tracking-wider">{t('penalty.total')}</span>
                    <span className="font-display font-bold text-accent-fg text-xl">{fe(euroTotal)}</span>
                </div>
                <div className="flex gap-2">
                    <Button variant="primary" className="flex-1" onClick={openSheet}>
                        ⚠️ + Strafe
                    </Button>
                    {players.length > 0 && (
                        <Button variant="secondary" className="flex-1" onClick={openDrinkSheet}>
                            🍺 + Getränk
                        </Button>
                    )}
                    {onQuickEntry && players.length > 0 && (
                        <Button variant="secondary" className="flex-shrink-0" onClick={onQuickEntry}>
                            ⚡ {t('quickEntry.open')}
                        </Button>
                    )}
                </div>
                {isAdmin(user) && (
                    <div className="mt-2">
                        <button
                            className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-2 ${hasAbsenceEntries ? 'border-accent text-accent-fg bg-accent/10' : 'border-line text-muted'}`}
                            onClick={doCalculateAbsence}
                            disabled={absenceLoading}>
                            🏠 {absenceLoading
                                ? t('action.loading')
                                : hasAbsenceEntries ? t('penalty.absence.recalculate') : t('penalty.absence.calculate')}
                        </button>
                        {absenceResult && !absenceLoading && (
                            <p className="text-xs text-muted text-center mt-1">
                                {absenceResult.absent_count > 0
                                    ? `${absenceResult.absent_count} ${t('penalty.absence.result')} · Ø ${fe(absenceResult.avg)}`
                                    : t('penalty.absence.none')}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Player filter chips ── */}
            {players.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <button className={`chip ${filterPlayer === null ? 'active' : ''}`}
                            onClick={() => setFilterPlayer(null)}>
                        {t('action.all')}
                    </button>
                    {players.map(p => (
                        <button key={p.id}
                                className={`chip ${filterPlayer === p.id ? 'active' : ''}`}
                                onClick={() => setFilterPlayer(filterPlayer === p.id ? null : p.id)}>
                            {p.is_king && <span role="img" aria-label={t('achievement.king.title')}>👑 </span>}
                            {p.name}<PinBadges pins={pins} memberId={p.regular_member_id}/>
                        </button>
                    ))}
                </div>
            )}

            {/* ── Game filter chips ── */}
            {showGameFilter && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <button className={`chip ${filterGame === null ? 'active' : ''}`}
                            onClick={() => setFilterGame(null)}>
                        {t('action.all')}
                    </button>
                    {gamesWithPenalties.map((g, i) => (
                        <button key={g.id}
                                className={`chip ${filterGame === g.id ? 'active' : ''}`}
                                onClick={() => setFilterGame(filterGame === g.id ? null : g.id)}>
                            🏆 {g.name || `${t('game.game')} ${i + 1}`}
                        </button>
                    ))}
                    {hasManualPenalties && (
                        <button className={`chip ${filterGame === -1 ? 'active' : ''}`}
                                onClick={() => setFilterGame(filterGame === -1 ? null : -1)}>
                            ✋ {t('penalty.manual')}
                        </button>
                    )}
                </div>
            )}

            {/* ── STRAFEN section heading ── */}
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-extrabold text-muted uppercase tracking-wider">
                    ⚠️ {t('nav.penalties')} ({log.length})
                </div>
                {isFiltered && (
                    <div className="text-xs font-extrabold text-accent-fg">
                        {t('penalty.filteredTotal')}: {fe(filteredEuroTotal)}
                    </div>
                )}
            </div>

            {/* Log */}
            {timeline.length === 0
                ? <Empty icon="⚠️" text={t('penalty.none')}/>
                : timeline.map((event, _idx) => {
                    if (event.kind === 'game_started') {
                        const band = gameBandIndex(evening.games, event.ts, event.game.id)
                        const bandColor = band != null ? gameBandColor(band) : 'var(--line)'
                        return (
                            <div key={`gs-${event.game.id}`} data-testid={`game-band-start-${event.game.id}`}
                                 className="flex items-center gap-2 my-2 px-1">
                                <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                                <Caption as="span" className="whitespace-nowrap flex items-center gap-1">
                                    <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{background: bandColor}}/>
                                    ▶ {event.game.name} · {fTime(event.ts)}
                                    {event.pending && <span className="px-1 py-0.5 rounded" style={{background: 'var(--accent-tint)', color: 'var(--accent-fg)'}}>⏳ {t('sync.pendingBadge')}</span>}
                                </Caption>
                                <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                            </div>
                        )
                    }
                    if (event.kind === 'game_finished') {
                        const band = gameBandIndex(evening.games, event.ts, event.game.id)
                        const bandColor = band != null ? gameBandColor(band) : 'var(--line)'
                        return (
                            <div key={`gf-${event.game.id}`} className="flex items-center gap-2 my-2 px-1">
                                <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                                <span
                                    className="text-xs font-bold text-accent-fg uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
                                    🏁 {event.game.name}{event.game.winner_name ? ` · ${event.game.winner_name}` : ''} · {fTime(event.ts)}
                                    {event.pending && <span className="px-1 py-0.5 rounded" style={{background: 'var(--accent-tint)', color: 'var(--accent-fg)'}}>⏳ {t('sync.pendingBadge')}</span>}
                                </span>
                                <div className="h-0.5 flex-1 rounded-full" style={{background: bandColor}}/>
                            </div>
                        )
                    }
                    const entry = event.entry
                    const isAbsence = entry.player_id === null && entry.penalty_type_name === 'Abwesenheit'
                    const entryGame = entry.game_id ? evening.games.find(g => g.id === entry.game_id) : null
                    const entryPlayer = players.find(p => p.id === entry.player_id)
                    const entryMember = regularMembers.find(m => m.id === entryPlayer?.regular_member_id)
                    const playerTotal = entryMember?.is_guest && guestPenaltyCap != null
                        ? evening.penalty_log
                            .filter(l => l.player_id === entry.player_id)
                            .reduce((s, l) => s + entryEuroValue(l), 0)
                        : null
                    const isCapped = playerTotal != null && playerTotal > guestPenaltyCap!
                    const isPendingEntry = entry.id < 0
                    const band = isAbsence ? null : gameBandIndex(evening.games, entry.client_timestamp, entry.game_id)
                    return (
                        <div key={`p-${entry.id}`} data-band={band ?? undefined}
                             className={`kce-card p-3 mb-2 flex items-center gap-3 ${isAbsence ? 'opacity-70' : ''}`}
                             style={band != null ? {borderLeft: `4px solid ${gameBandColor(band)}`} : undefined}>
                            <span className="text-xl flex-shrink-0">{entry.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                    <span className="truncate">{entry.player_name}</span>
                                    {isPendingEntry && (
                                        <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                                              style={{background: 'var(--accent-tint)', color: 'var(--accent-fg)'}}>
                                            ⏳ {t('sync.pendingBadge')}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted truncate flex items-center gap-1">
                                    {entry.penalty_type_name}
                                    {entryGame && <span className="text-muted">· {entryGame.name}</span>}
                                    {isCapped && <span className="text-accent-fg">· ≤ {fe(guestPenaltyCap!)}</span>}
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                {entry.mode === 'euro'
                                    ? <span className="text-sm font-bold text-danger-fg">{fe(entry.amount)}</span>
                                    : <span className="text-sm font-bold text-danger-fg">
                                    {entry.unit_amount != null
                                        ? `${entry.amount} × ${fe(entry.unit_amount)}`
                                        : `×${entry.amount}`}
                                  </span>
                                }
                                <div className="text-xs text-muted">{fTime(entry.client_timestamp)}</div>
                            </div>
                            <CardActionMenu
                                title={`${entry.icon} ${entry.penalty_type_name} · ${entry.player_name}`}
                                label={`${t('action.more')}: ${entry.penalty_type_name} · ${entry.player_name}`}
                                actions={[
                                    // A queued entry has no server row yet, so there is nothing to edit —
                                    // only the queued creation itself can be cancelled.
                                    ...(isPendingEntry ? [] : [{
                                        icon: '✏️', label: t('action.edit'),
                                        onClick: () => openEditSheet(entry),
                                    }]),
                                    {
                                        icon: '🗑️', label: t('action.delete'), danger: true,
                                        onClick: () => setConfirmDeleteId(entry.id),
                                    },
                                ]}/>
                        </div>
                    )
                })
            }

            {/* Delete penalty confirm */}
            {confirmDeleteId !== null && (
                <ConfirmSheet open onClose={() => setConfirmDeleteId(null)} title={t('action.delete')}
                              message={t('penalty.deleteConfirm')} onConfirm={() => confirmDelete(confirmDeleteId)}/>
            )}

            {/* ── GETRÄNKE section ── */}
            <div className="text-xs font-extrabold text-muted uppercase tracking-wider mb-2 mt-5">
                🍺 {t('drinks.title')} ({drinkRounds.length})
            </div>
            {drinkRounds.length === 0
                ? <Empty icon="🍺" text={t('drinks.noRounds')}/>
                : drinkRounds.map(r => {
                    const isPendingDrink = r.id < 0
                    const icon = r.drink_type === 'beer' ? '🍺' : '🥃'
                    const label = r.drink_type === 'beer' ? t('drinks.beer') : t('drinks.shots')
                    return (
                        <div key={r.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <span className="text-xl flex-shrink-0">{icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold flex items-center gap-1.5">
                                    <span>{label}{r.variety ? ` · ${r.variety}` : ''}</span>
                                    {isPendingDrink && (
                                        <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                                              style={{background: 'var(--accent-tint)', color: 'var(--accent-fg)'}}>
                                            ⏳ {t('sync.pendingBadge')}
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted">{r.participant_ids.length} {t('drinks.playerCount')} · {fTime(r.client_timestamp)}</div>
                            </div>
                            {!evening.is_closed && (
                                <CardActionMenu
                                    title={`${icon} ${label}`}
                                    label={`${t('action.more')}: ${label}`}
                                    actions={[{
                                        icon: '🗑️', label: t('action.delete'), danger: true,
                                        onClick: () => setConfirmDeleteDrinkId(r.id),
                                    }]}/>
                            )}
                        </div>
                    )
                })
            }

            {/* Delete drink round confirm */}
            {confirmDeleteDrinkId !== null && (
                <ConfirmSheet open onClose={() => setConfirmDeleteDrinkId(null)} title={t('action.delete')}
                              message={t('drinks.deleteConfirm')} onConfirm={() => confirmDeleteDrink(confirmDeleteDrinkId)}/>
            )}

            {/* Add penalty sheet */}
            <Sheet open={sheet} onClose={() => setSheet(false)} title={t('penalty.enter')}
                   onSubmit={tab === 'quick' ? submitQuick : submitCustom}>
                <div className="flex gap-1 mb-3">
                    {([['quick', t('penalty.quick')], ['custom', t('penalty.custom')]] as const).map(([id, label]) => (
                        <button key={id} type="button"
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                                onClick={() => setTab(id)}>{label}
                        </button>
                    ))}
                </div>

                {tab === 'quick' ? (
                    <div className="flex flex-col gap-3">
                        {/* 1 — Players */}
                        <ChipSelect
                            label={t('penalty.who')}
                            options={playerOptions}
                            selected={playerIds}
                            onChange={setPlayerIds}
                            onSelectAll={() => setPlayerIds(players.map(p => p.id))}
                            onSelectNone={() => setPlayerIds([])}/>

                        {/* 2 — Pick type */}
                        <div>
                            <div className="field-label">{t('penalty.type')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {penaltyTypes.map(pt => (
                                    <PenaltyPickButton key={pt.id} type={pt}
                                                       className={`chip ${selectedType === pt.id ? 'active' : ''}`}
                                                       onSelect={() => {
                                                           setSelectedType(pt.id);
                                                           setAmount(mode === 'euro' ? String(pt.default_amount) : '')
                                                       }}>
                                        {pt.icon} {pt.name}
                                    </PenaltyPickButton>
                                ))}
                            </div>
                        </div>

                        {/* 3 — Mode + Amount (less prominent) */}
                        <div className="border border-line rounded-xl p-3 flex flex-col gap-2">
                            <ModeToggle
                                options={[{value: 'count', label: t('penalty.mode.count')}, {
                                    value: 'euro',
                                    label: t('penalty.mode.euro')
                                }]}
                                value={mode} onChange={v => {
                                const m = v as PenaltyMode
                                setMode(m)
                                setAmount(m === 'euro' && selectedPenaltyType ? String(selectedPenaltyType.default_amount) : '')
                            }}/>
                            {selectedPenaltyType && (
                                <AmountInput
                                    mode={mode}
                                    value={amount}
                                    onChange={setAmount}
                                    defaultAmount={mode === 'euro' ? selectedPenaltyType.default_amount : undefined}/>
                            )}
                        </div>

                        <Button type="submit" variant="primary" block
                                disabled={saving || !selectedType || playerIds.length === 0}>
                            {t('penalty.confirm')}
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {/* 1 — Players */}
                        <ChipSelect
                            label={t('penalty.who')}
                            options={playerOptions}
                            selected={customPlayerIds}
                            onChange={setCustomPlayerIds}
                            onSelectAll={() => setCustomPlayerIds(players.map(p => p.id))}
                            onSelectNone={() => setCustomPlayerIds([])}/>

                        {/* 2 — Icon + Name */}
                        <div className="flex gap-2">
                            <Field label="Icon">
                                <EmojiPickerButton value={customIcon} onChange={setCustomIcon}/>
                            </Field>
                            <Field label="Name" className="flex-1">
                                <input className="kce-input" value={customName}
                                       onChange={e => setCustomName(e.target.value)}
                                       placeholder="z.B. Zu spät…"/>
                            </Field>
                        </div>

                        {/* 3 — Mode + Amount (less prominent) */}
                        <div className="border border-line rounded-xl p-3 flex flex-col gap-2">
                            <ModeToggle
                                options={[{value: 'count', label: t('penalty.mode.count')}, {
                                    value: 'euro',
                                    label: t('penalty.mode.euro')
                                }]}
                                value={customMode} onChange={v => {
                                setCustomMode(v as PenaltyMode);
                                setCustomAmount('');
                                setCustomUnitAmount('')
                            }}/>
                            <AmountInput mode={customMode} value={customAmount} onChange={setCustomAmount}/>
                            {customMode === 'count' && (
                                <Field label={t('penalty.unitAmount')}>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                                        <input className="kce-input flex-1"
                                               type="text" inputMode="decimal"
                                               value={customUnitAmount}
                                               placeholder="0,50"
                                               onChange={e => setCustomUnitAmount(e.target.value)}/>
                                    </div>
                                </Field>
                            )}
                        </div>

                        {/* 4 — Save as template (admin only) */}
                        {isAdmin(user) && (
                            <button type="button"
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${saveAsTemplate ? 'border-accent text-accent-fg bg-accent/10' : 'border-line text-muted'}`}
                                    onClick={() => setSaveAsTemplate(v => !v)}>
                                <span>{saveAsTemplate ? '✓' : '+'}</span>
                                {t('penalty.saveAsTemplate')}
                            </button>
                        )}

                        <Button type="submit" variant="primary" block
                                disabled={saving || !customName.trim() || customPlayerIds.length === 0}>
                            {t('penalty.confirm')}
                        </Button>
                    </div>
                )}
            </Sheet>

            {/* Drink sheet */}
            <Sheet open={drinkSheet} onClose={() => setDrinkSheet(false)} title={t('drinks.round')}>
                <div className="flex flex-col gap-3">
                    <div className="flex gap-1">
                        {(['beer', 'shots'] as const).map(dt => (
                            <button key={dt} type="button"
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${drinkType === dt ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                                    onClick={() => setDrinkType(dt)}>
                                {dt === 'beer' ? `🍺 ${t('drinks.beer')}` : `🥃 ${t('drinks.shots')}`}
                            </button>
                        ))}
                    </div>
                    <Field label={t('drinks.variety')}>
                        <input className="kce-input" value={drinkVariety}
                               onChange={e => setDrinkVariety(e.target.value)}
                               placeholder={t('drinks.sortPlaceholder')}/>
                    </Field>
                    <ChipSelect
                        label={t('drinks.who')}
                        options={playerOptions}
                        selected={drinkPlayerIds}
                        onChange={setDrinkPlayerIds}
                        onSelectAll={() => setDrinkPlayerIds(players.map(p => p.id))}
                        onSelectNone={() => setDrinkPlayerIds([])}/>
                    <div className="flex gap-2">
                        <Button type="button" variant="primary" block disabled={drinkPlayerIds.length === 0}
                                onClick={async () => {
                                    await api.addDrinkRound(evening!.id, {
                                        drink_type: drinkType,
                                        variety: drinkVariety || undefined,
                                        participant_ids: drinkPlayerIds as number[],
                                        client_timestamp: Date.now(),
                                    })
                                    invalidate()
                                    setDrinkSheet(false)
                                }}>{t('action.done')}</Button>
                    </div>
                </div>
            </Sheet>

            {/* Edit penalty sheet */}
            <Sheet open={!!editEntry} onClose={() => setEditEntry(null)} title={t('penalty.edit')}
                   onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    {/* Quick / custom toggle */}
                    <div className="flex gap-1">
                        {([['quick', t('penalty.quick')], ['custom', t('penalty.custom')]] as const).map(([id, label]) => (
                            <button key={id} type="button"
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${editTab === id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                                    onClick={() => setEditTab(id)}>{label}
                            </button>
                        ))}
                    </div>

                    {editTab === 'quick' ? (
                        /* Penalty type */
                        <div>
                            <div className="field-label">{t('penalty.type')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {penaltyTypes.map(pt => (
                                    <button key={pt.id} type="button"
                                            className={`chip ${editType === pt.id ? 'active' : ''}`}
                                            onClick={() => {
                                                setEditType(pt.id);
                                                setEditAmount('')
                                            }}>
                                        {pt.icon} {pt.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Icon + Name */
                        <div className="flex gap-2">
                            <Field label="Icon">
                                <EmojiPickerButton value={editIcon} onChange={setEditIcon}/>
                            </Field>
                            <Field label="Name" className="flex-1">
                                <input className="kce-input" value={editName}
                                       onChange={e => setEditName(e.target.value)}
                                       placeholder="z.B. Zu spät…"/>
                            </Field>
                        </div>
                    )}

                    {/* Mode */}
                    <ModeToggle
                        options={[{value: 'count', label: t('penalty.mode.count')}, {
                            value: 'euro',
                            label: t('penalty.mode.euro')
                        }]}
                        value={editMode} onChange={v => {
                        setEditMode(v as PenaltyMode);
                        setEditAmount('')
                    }}/>

                    {/* Amount */}
                    <AmountInput
                        mode={editMode}
                        value={editAmount}
                        onChange={setEditAmount}
                        defaultAmount={editMode === 'euro' && editTab === 'quick' ? editPenaltyType?.default_amount : undefined}/>

                    {/* Player */}
                    <div>
                        <div className="field-label">{t('penalty.who')}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {players.map(p => (
                                <button key={p.id} type="button"
                                        className={`chip ${editPlayerId === p.id ? 'active' : ''}`}
                                        onClick={() => setEditPlayerId(p.id)}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date override (admin only) */}
                    {isAdmin(user) && (
                        <Field label={t('penalty.date')}>
                            <input type="datetime-local" className="kce-input" value={editDate}
                                   onChange={e => setEditDate(e.target.value)}/>
                        </Field>
                    )}

                    <Button type="submit" variant="primary" block
                            disabled={saving || (editTab === 'custom' && !editName.trim()) || (editTab === 'quick' && !editType)}>
                        {t('action.save')}
                    </Button>
                </div>
            </Sheet>
        </div>
    )
}
