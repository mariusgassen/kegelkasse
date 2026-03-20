import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ChipSelect} from '@/components/ui/ChipSelect.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {EmojiPickerButton} from '@/components/ui/EmojiPickerButton.tsx'
import {toastError} from '@/utils/error.ts'
import {parseAmount} from '@/utils/parse.ts'
import type {PenaltyLogEntry, PenaltyMode} from '@/types.ts'

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
        <div>
            <label className="field-label">{label}</label>
            <div className="flex items-center gap-2">
                <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">
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
        </div>
    )
}

export function ProtocolPage() {
    const t = useT()
    const qc = useQueryClient()
    const {evening, invalidate} = useActiveEvening()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const setPenaltyTypes = useAppStore(s => s.setPenaltyTypes)
    const regularMembers = useAppStore(s => s.regularMembers)
    const guestPenaltyCap = useAppStore(s => s.guestPenaltyCap)
    const user = useAppStore(s => s.user)
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
    const [editPlayerId, setEditPlayerId] = useState<number | null>(null)
    const [editType, setEditType] = useState<number | null>(null)
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
    const playerOptions = players.map(p => ({id: p.id, label: p.name}))

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
        setEditMode(entry.mode)
        setEditAmount(String(entry.amount))
        const d = new Date(entry.client_timestamp)
        setEditDate(d.toISOString().slice(0, 16))
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
                client_timestamp: Math.min(Date.now(), new Date(evening!.date).getTime()),
            })
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
                client_timestamp: Math.min(Date.now(), new Date(evening!.date).getTime()),
            })
            if (saveAsTemplate) {
                const newPt = await api.createPenaltyType({
                    icon: customIcon,
                    name: customName,
                    default_amount: customMode === 'count' ? (effectiveUnitAmount ?? 0) : effectiveAmount,
                    sort_order: 99,
                })
                setPenaltyTypes([...penaltyTypes, newPt])
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
            await api.deletePenalty(evening!.id, lid)
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setConfirmDeleteId(null)
        }
    }

    async function submitEdit() {
        if (!editEntry) return
        const pt = penaltyTypes.find(p => p.id === editType)
        const patch: Parameters<typeof api.updatePenalty>[2] = {}
        if (editPlayerId !== editEntry.player_id) patch.player_id = editPlayerId ?? undefined
        if (pt && pt.name !== editEntry.penalty_type_name) {
            patch.penalty_type_name = pt.name
            patch.icon = pt.icon
        }
        if (editMode !== editEntry.mode) patch.mode = editMode
        const newAmount = editMode === 'count'
            ? (parseInt(editAmount) || 1)
            : (parseAmount(editAmount) || (pt?.default_amount ?? editEntry.amount))
        if (newAmount !== editEntry.amount) patch.amount = newAmount
        const originalDate = new Date(editEntry.client_timestamp).toISOString().slice(0, 16)
        if (editDate && editDate !== originalDate) patch.date = editDate
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

    // Games that have at least one associated penalty
    const gamesWithPenalties = evening.games.filter(g => evening.penalty_log.some(l => l.game_id === g.id))
    const hasManualPenalties = evening.penalty_log.some(l => l.game_id === null)
    const showGameFilter = gamesWithPenalties.length > 0
    const hasAbsenceEntries = evening.penalty_log.some(l => l.player_id === null && l.penalty_type_name === 'Abwesenheit')

    // Build merged timeline (only when no player filter active)
    type TimelineEvent =
        | { kind: 'penalty'; entry: typeof log[0]; ts: number }
        | { kind: 'game_started'; game: typeof evening.games[0]; ts: number }
        | { kind: 'game_finished'; game: typeof evening.games[0]; ts: number }

    const timeline: TimelineEvent[] = log.map(e => ({kind: 'penalty', entry: e, ts: e.client_timestamp}))

    if (filterPlayer === null) {
        for (const g of evening.games) {
            if (g.started_at) timeline.push({kind: 'game_started', game: g, ts: new Date(g.started_at).getTime()})
            if (g.finished_at) timeline.push({kind: 'game_finished', game: g, ts: new Date(g.finished_at).getTime()})
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
                    <span className="text-xs font-extrabold text-kce-muted uppercase tracking-wider">{t('penalty.total')}</span>
                    <span className="font-display font-bold text-kce-amber text-xl">{fe(euroTotal)}</span>
                </div>
                <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={openSheet}>
                        ⚠️ + Strafe
                    </button>
                    {players.length > 0 && (
                        <button className="btn-secondary flex-1" onClick={openDrinkSheet}>
                            🍺 + Getränk
                        </button>
                    )}
                </div>
                {isAdmin(user) && (
                    <div className="mt-2">
                        <button
                            className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-all border flex items-center justify-center gap-2 ${hasAbsenceEntries ? 'border-kce-amber text-kce-amber bg-kce-amber/10' : 'border-kce-border text-kce-muted'}`}
                            onClick={doCalculateAbsence}
                            disabled={absenceLoading}>
                            🏠 {hasAbsenceEntries ? t('penalty.absence.recalculate') : t('penalty.absence.calculate')}
                        </button>
                        {absenceResult && (
                            <p className="text-xs text-kce-muted text-center mt-1">
                                {absenceResult.absent_count} {t('penalty.absence.result')} · Ø {fe(absenceResult.avg)}
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
                            {p.is_king ? '👑 ' : ''}{p.name}
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
            <div className="text-xs font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                ⚠️ {t('nav.penalties')} ({evening.penalty_log.length})
            </div>

            {/* Log */}
            {timeline.length === 0
                ? <Empty icon="⚠️" text={t('penalty.none')}/>
                : timeline.map((event, _idx) => {
                    if (event.kind === 'game_started') {
                        return (
                            <div key={`gs-${event.game.id}`} className="flex items-center gap-2 my-2 px-1">
                                <div className="h-px flex-1 bg-kce-border"/>
                                <span
                                    className="text-[10px] font-bold text-kce-muted uppercase tracking-wider whitespace-nowrap">
                                    ▶ {event.game.name} · {fTime(event.ts)}
                                </span>
                                <div className="h-px flex-1 bg-kce-border"/>
                            </div>
                        )
                    }
                    if (event.kind === 'game_finished') {
                        return (
                            <div key={`gf-${event.game.id}`} className="flex items-center gap-2 my-2 px-1">
                                <div className="h-px flex-1 bg-kce-amber/40"/>
                                <span
                                    className="text-[10px] font-bold text-kce-amber uppercase tracking-wider whitespace-nowrap">
                                    🏁 {event.game.name}{event.game.winner_name ? ` · ${event.game.winner_name}` : ''} · {fTime(event.ts)}
                                </span>
                                <div className="h-px flex-1 bg-kce-amber/40"/>
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
                    return (
                        <div key={`p-${entry.id}`}
                             className={`kce-card p-3 mb-2 flex items-center gap-3 ${isAbsence ? 'opacity-70' : ''}`}>
                            <span className="text-xl flex-shrink-0">{entry.icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{entry.player_name}</div>
                                <div className="text-xs text-kce-muted truncate flex items-center gap-1">
                                    {entry.penalty_type_name}
                                    {entryGame && <span className="text-kce-muted">· {entryGame.name}</span>}
                                    {isCapped && <span className="text-kce-amber">· ≤ {fe(guestPenaltyCap!)}</span>}
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                                {entry.mode === 'euro'
                                    ? <span className="text-sm font-bold text-red-400">{fe(entry.amount)}</span>
                                    : <span className="text-sm font-bold text-red-400">
                                    {entry.unit_amount != null
                                        ? `${entry.amount} × ${fe(entry.unit_amount)}`
                                        : `×${entry.amount}`}
                                  </span>
                                }
                                <div className="text-xs text-kce-muted">{fTime(entry.client_timestamp)}</div>
                            </div>
                            <button className="btn-ghost btn-xs flex-shrink-0 text-kce-muted"
                                    onClick={() => openEditSheet(entry)}>✏️
                            </button>
                            {confirmDeleteId === entry.id ? (
                                <div className="flex gap-1 flex-shrink-0">
                                    <button className="btn-danger btn-xs"
                                            onClick={() => confirmDelete(entry.id)}>✓
                                    </button>
                                    <button className="btn-secondary btn-xs"
                                            onClick={() => setConfirmDeleteId(null)}>✕
                                    </button>
                                </div>
                            ) : (
                                <button className="btn-danger btn-xs flex-shrink-0"
                                        onClick={() => setConfirmDeleteId(entry.id)}>✕
                                </button>
                            )}
                        </div>
                    )
                })
            }

            {/* ── GETRÄNKE section ── */}
            <div className="text-xs font-extrabold text-kce-muted uppercase tracking-wider mb-2 mt-5">
                🍺 {t('drinks.title')} ({drinkRounds.length})
            </div>
            {drinkRounds.length === 0
                ? <Empty icon="🍺" text={t('drinks.noRounds')}/>
                : drinkRounds.map(r => {
                    const icon = r.drink_type === 'beer' ? '🍺' : '🥃'
                    const label = r.drink_type === 'beer' ? t('drinks.beer') : t('drinks.shots')
                    return (
                        <div key={r.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <span className="text-xl flex-shrink-0">{icon}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold">{label}{r.variety ? ` · ${r.variety}` : ''}</div>
                                <div className="text-xs text-kce-muted">{r.participant_ids.length} {t('drinks.playerCount')} · {fTime(r.client_timestamp)}</div>
                            </div>
                            {!evening.is_closed && (
                                <button className="btn-danger btn-xs flex-shrink-0" onClick={async () => {
                                    await api.deleteDrinkRound(evening.id, r.id)
                                    invalidate()
                                }}>✕</button>
                            )}
                        </div>
                    )
                })
            }

            {/* Add penalty sheet */}
            <Sheet open={sheet} onClose={() => setSheet(false)} title={t('penalty.enter')}
                   onSubmit={tab === 'quick' ? submitQuick : submitCustom}>
                <div className="flex gap-1 mb-3">
                    {([['quick', t('penalty.quick')], ['custom', t('penalty.custom')]] as const).map(([id, label]) => (
                        <button key={id} type="button"
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
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
                                    <button key={pt.id} type="button"
                                            className={`chip ${selectedType === pt.id ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedType(pt.id);
                                                setAmount(mode === 'euro' ? String(pt.default_amount) : '')
                                            }}>
                                        {pt.icon} {pt.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3 — Mode + Amount (less prominent) */}
                        <div className="border border-kce-border rounded-xl p-3 flex flex-col gap-2">
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

                        <button type="submit" className="btn-primary w-full"
                                disabled={saving || !selectedType || playerIds.length === 0}>
                            {t('penalty.confirm')}
                        </button>
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
                            <div>
                                <label className="field-label">Icon</label>
                                <EmojiPickerButton value={customIcon} onChange={setCustomIcon}/>
                            </div>
                            <div className="flex-1">
                                <label className="field-label">Name</label>
                                <input className="kce-input" value={customName}
                                       onChange={e => setCustomName(e.target.value)}
                                       placeholder="z.B. Zu spät…"/>
                            </div>
                        </div>

                        {/* 3 — Mode + Amount (less prominent) */}
                        <div className="border border-kce-border rounded-xl p-3 flex flex-col gap-2">
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
                                <div>
                                    <label className="field-label">{t('penalty.unitAmount')}</label>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                                        <input className="kce-input flex-1"
                                               type="text" inputMode="decimal"
                                               value={customUnitAmount}
                                               placeholder="0,50"
                                               onChange={e => setCustomUnitAmount(e.target.value)}/>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 4 — Save as template (admin only) */}
                        {isAdmin(user) && (
                            <button type="button"
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${saveAsTemplate ? 'border-kce-amber text-kce-amber bg-kce-amber/10' : 'border-kce-border text-kce-muted'}`}
                                    onClick={() => setSaveAsTemplate(v => !v)}>
                                <span>{saveAsTemplate ? '✓' : '+'}</span>
                                {t('penalty.saveAsTemplate')}
                            </button>
                        )}

                        <button type="submit" className="btn-primary w-full"
                                disabled={saving || !customName.trim() || customPlayerIds.length === 0}>
                            {t('penalty.confirm')}
                        </button>
                    </div>
                )}
            </Sheet>

            {/* Drink sheet */}
            <Sheet open={drinkSheet} onClose={() => setDrinkSheet(false)} title={t('drinks.round')}>
                <div className="flex flex-col gap-3">
                    <div className="flex gap-1">
                        {(['beer', 'shots'] as const).map(dt => (
                            <button key={dt} type="button"
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${drinkType === dt ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                    onClick={() => setDrinkType(dt)}>
                                {dt === 'beer' ? `🍺 ${t('drinks.beer')}` : `🥃 ${t('drinks.shots')}`}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="field-label">{t('drinks.variety')}</label>
                        <input className="kce-input" value={drinkVariety}
                               onChange={e => setDrinkVariety(e.target.value)}
                               placeholder={t('drinks.sortPlaceholder')}/>
                    </div>
                    <ChipSelect
                        label={t('drinks.who')}
                        options={playerOptions}
                        selected={drinkPlayerIds}
                        onChange={setDrinkPlayerIds}
                        onSelectAll={() => setDrinkPlayerIds(players.map(p => p.id))}
                        onSelectNone={() => setDrinkPlayerIds([])}/>
                    <div className="flex gap-2">
                        <button type="button" className="btn-primary w-full" disabled={drinkPlayerIds.length === 0}
                                onClick={async () => {
                                    await api.addDrinkRound(evening!.id, {
                                        drink_type: drinkType,
                                        variety: drinkVariety || undefined,
                                        participant_ids: drinkPlayerIds as number[],
                                        client_timestamp: Math.min(Date.now(), new Date(evening!.date).getTime()),
                                    })
                                    invalidate()
                                    setDrinkSheet(false)
                                }}>{t('action.done')}</button>
                    </div>
                </div>
            </Sheet>

            {/* Edit penalty sheet */}
            <Sheet open={!!editEntry} onClose={() => setEditEntry(null)} title={t('penalty.edit')}
                   onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    {/* Penalty type */}
                    <div>
                        <div className="field-label">{t('penalty.quick')}</div>
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
                        defaultAmount={editMode === 'euro' ? editPenaltyType?.default_amount : undefined}/>

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
                        <div>
                            <label className="field-label">{t('penalty.date')}</label>
                            <input type="datetime-local" className="kce-input" value={editDate}
                                   onChange={e => setEditDate(e.target.value)}/>
                        </div>
                    )}

                    <button type="submit" className="btn-primary w-full" disabled={saving}>
                        {t('action.save')}
                    </button>
                </div>
            </Sheet>
        </div>
    )
}
