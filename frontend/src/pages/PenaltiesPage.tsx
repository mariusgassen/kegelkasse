import {useState} from 'react'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ChipSelect} from '@/components/ui/ChipSelect.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import type {PenaltyMode} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
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
                       type="number"
                       step={isEuro ? '0.10' : '1'}
                       min="0"
                       value={value}
                       placeholder={placeholder}
                       onChange={e => onChange(e.target.value)}/>
            </div>
        </div>
    )
}

export function PenaltiesPage() {
    const t = useT()
    const {evening, invalidate} = useActiveEvening()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const setPenaltyTypes = useAppStore(s => s.setPenaltyTypes)
    const [sheet, setSheet] = useState(false)
    const [tab, setTab] = useState<'quick' | 'custom'>('quick')

    // Quick form
    const [selectedType, setSelectedType] = useState<number | null>(null)
    const [playerIds, setPlayerIds] = useState<(number | string)[]>([])
    const [mode, setMode] = useState<PenaltyMode>('euro')
    const [amount, setAmount] = useState('')

    // Custom form
    const [customIcon, setCustomIcon] = useState('⚠️')
    const [customName, setCustomName] = useState('')
    const [customAmount, setCustomAmount] = useState('')
    const [customMode, setCustomMode] = useState<PenaltyMode>('euro')
    const [customPlayerIds, setCustomPlayerIds] = useState<(number | string)[]>([])
    const [saveAsTemplate, setSaveAsTemplate] = useState(false)

    const [saving, setSaving] = useState(false)

    if (!evening) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">⚠️ {t('nav.penalties')}</div>
                <Empty icon="⚠️" text={t('evening.noActive')}/>
            </div>
        )
    }

    const players = evening.players
    const playerOptions = players.map(p => ({id: p.id, label: p.name}))

    const euroTotal = evening.penalty_log
        .filter(l => l.mode === 'euro')
        .reduce((sum, l) => sum + l.amount, 0)

    const selectedPenaltyType = penaltyTypes.find(pt => pt.id === selectedType)

    function openSheet() {
        setTab('quick')
        setSelectedType(penaltyTypes[0]?.id ?? null)
        setPlayerIds([])
        setMode('euro')
        setAmount('')
        setCustomIcon('⚠️')
        setCustomName('')
        setCustomAmount('')
        setCustomMode('euro')
        setCustomPlayerIds([])
        setSaveAsTemplate(false)
        setSheet(true)
    }

    async function submitQuick() {
        if (!selectedPenaltyType || playerIds.length === 0) return
        const effectiveAmount = mode === 'count'
            ? (parseInt(amount) || 1)
            : (parseFloat(amount) || selectedPenaltyType.default_amount)
        setSaving(true)
        try {
            await api.addPenalty(evening!.id, {
                player_ids: playerIds as number[],
                penalty_type_name: selectedPenaltyType.name,
                icon: selectedPenaltyType.icon,
                amount: effectiveAmount,
                mode,
                client_timestamp: Date.now(),
            })
            invalidate()
            setSheet(false)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    async function submitCustom() {
        if (!customName.trim() || customPlayerIds.length === 0) return
        const effectiveAmount = customMode === 'count'
            ? (parseInt(customAmount) || 1)
            : (parseFloat(customAmount) || 0)
        setSaving(true)
        try {
            await api.addPenalty(evening!.id, {
                player_ids: customPlayerIds as number[],
                penalty_type_name: customName,
                icon: customIcon,
                amount: effectiveAmount,
                mode: customMode,
                client_timestamp: Date.now(),
            })
            if (saveAsTemplate) {
                const newPt = await api.createPenaltyType({
                    icon: customIcon,
                    name: customName,
                    default_amount: effectiveAmount,
                    sort_order: 99,
                })
                setPenaltyTypes([...penaltyTypes, newPt])
            }
            invalidate()
            setSheet(false)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    async function deleteEntry(lid: number) {
        try {
            await api.deletePenalty(evening!.id, lid)
            invalidate()
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        }
    }

    const log = [...evening.penalty_log].reverse()

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">⚠️ {t('nav.penalties')}</div>

            {/* Total */}
            <div className="kce-card p-4 mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-kce-muted">{t('penalty.total')}</span>
                <span className="font-display font-bold text-kce-amber text-xl">{fe(euroTotal)}</span>
            </div>

            {/* Add button */}
            <button className="btn-primary w-full mb-4" onClick={openSheet}>
                + {t('penalty.enter')}
            </button>

            {/* Log */}
            {log.length === 0
                ? <Empty icon="⚠️" text={t('penalty.none')}/>
                : log.map(entry => (
                    <div key={entry.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                        <span className="text-xl flex-shrink-0">{entry.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">{entry.player_name}</div>
                            <div className="text-xs text-kce-muted truncate">{entry.penalty_type_name}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            {entry.mode === 'euro'
                                ? <span className="text-sm font-bold text-red-400">{fe(entry.amount)}</span>
                                : <span className="text-sm font-bold text-red-400">×{entry.amount}</span>
                            }
                        </div>
                        <button className="btn-danger btn-xs flex-shrink-0"
                                onClick={() => deleteEntry(entry.id)}>✕
                        </button>
                    </div>
                ))
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
                        {/* 1 — Pick type */}
                        <div>
                            <div className="field-label">{t('penalty.quick')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {penaltyTypes.map(pt => (
                                    <button key={pt.id} type="button"
                                            className={`chip ${selectedType === pt.id ? 'active' : ''}`}
                                            onClick={() => { setSelectedType(pt.id); setAmount('') }}>
                                        {pt.icon} {pt.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2 — Mode (defines what kind of value to enter next) */}
                        <ModeToggle
                            options={[{value: 'euro', label: t('penalty.mode.euro')}, {value: 'count', label: t('penalty.mode.count')}]}
                            value={mode} onChange={v => { setMode(v as PenaltyMode); setAmount('') }}/>

                        {/* 3 — Amount (label/step/placeholder adapt to mode) */}
                        {selectedPenaltyType && (
                            <AmountInput
                                mode={mode}
                                value={amount}
                                onChange={setAmount}
                                defaultAmount={mode === 'euro' ? selectedPenaltyType.default_amount : undefined}/>
                        )}

                        {/* 4 — Players */}
                        <ChipSelect
                            label={t('penalty.who')}
                            options={playerOptions}
                            selected={playerIds}
                            onChange={setPlayerIds}
                            onSelectAll={() => setPlayerIds(players.map(p => p.id))}
                            onSelectNone={() => setPlayerIds([])}/>

                        <div className="flex gap-2 mt-1">
                            <button type="button" className="btn-secondary flex-1" onClick={() => setSheet(false)}>
                                {t('action.cancel')}
                            </button>
                            <button type="submit" className="btn-primary flex-[2]" disabled={saving || !selectedType || playerIds.length === 0}>
                                {t('penalty.confirm')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {/* 1 — Icon + Name */}
                        <div className="flex gap-2">
                            <div>
                                <label className="field-label">Icon</label>
                                <input className="kce-input w-14 text-center" value={customIcon}
                                       onChange={e => setCustomIcon(e.target.value)}/>
                            </div>
                            <div className="flex-1">
                                <label className="field-label">Name</label>
                                <input className="kce-input" value={customName}
                                       onChange={e => setCustomName(e.target.value)}
                                       placeholder="z.B. Zu spät…"/>
                            </div>
                        </div>

                        {/* 2 — Mode */}
                        <ModeToggle
                            options={[{value: 'euro', label: t('penalty.mode.euro')}, {value: 'count', label: t('penalty.mode.count')}]}
                            value={customMode} onChange={v => { setCustomMode(v as PenaltyMode); setCustomAmount('') }}/>

                        {/* 3 — Amount (adapts to mode) */}
                        <AmountInput mode={customMode} value={customAmount} onChange={setCustomAmount}/>

                        {/* 4 — Players */}
                        <ChipSelect
                            label={t('penalty.who')}
                            options={playerOptions}
                            selected={customPlayerIds}
                            onChange={setCustomPlayerIds}
                            onSelectAll={() => setCustomPlayerIds(players.map(p => p.id))}
                            onSelectNone={() => setCustomPlayerIds([])}/>

                        {/* 5 — Save as template toggle */}
                        <button type="button"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${saveAsTemplate ? 'border-kce-amber text-kce-amber bg-kce-amber/10' : 'border-kce-border text-kce-muted'}`}
                                onClick={() => setSaveAsTemplate(v => !v)}>
                            <span>{saveAsTemplate ? '✓' : '+'}</span>
                            {t('penalty.saveAsTemplate')}
                        </button>

                        <div className="flex gap-2 mt-1">
                            <button type="button" className="btn-secondary flex-1" onClick={() => setSheet(false)}>
                                {t('action.cancel')}
                            </button>
                            <button type="submit" className="btn-primary flex-[2]"
                                    disabled={saving || !customName.trim() || customPlayerIds.length === 0}>
                                {t('penalty.confirm')}
                            </button>
                        </div>
                    </div>
                )}
            </Sheet>
        </div>
    )
}
