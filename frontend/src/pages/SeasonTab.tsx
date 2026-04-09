import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Empty} from '@/components/ui/Empty.tsx'
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {SeasonSnapshot} from '@/types'

type Balance = {
    regular_member_id: number
    name: string
    nickname: string | null
    penalty_total: number
    payments_total: number
    balance: number
}

type WizardStep = 'landing' | 'preview' | 'confirm' | 'done'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})
}

function displayName(b: Balance) {
    return b.nickname || b.name
}

export function SeasonTab() {
    const t = useT()
    const qc = useQueryClient()

    const currentYear = new Date().getFullYear()
    const [year, setYear] = useState(currentYear)
    const [step, setStep] = useState<WizardStep>('landing')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [snapshot, setSnapshot] = useState<SeasonSnapshot | null>(null)
    const [settledIds, setSettledIds] = useState<Set<number>>(new Set())

    const {data: availableYears = [currentYear]} = useQuery({
        queryKey: ['season-available-years'],
        queryFn: api.listSeasonAvailableYears,
    })

    const {data: snapshots = [], isLoading: snapsLoading} = useQuery({
        queryKey: ['season-snapshots'],
        queryFn: api.listSeasonSnapshots,
    })

    const {data: balances = [], isLoading: balancesLoading} = useQuery({
        queryKey: ['season-balance-preview', year],
        queryFn: () => api.getSeasonBalancePreview(year),
        enabled: step !== 'landing',
    })

    // When balances load, default all to selected
    useEffect(() => {
        if (balances.length > 0) {
            setSettledIds(new Set((balances as Balance[]).map(b => b.regular_member_id)))
        } else {
            setSettledIds(new Set())
        }
    }, [balances.length, year])

    const nonZeroBalances = balances as Balance[]
    const alreadyClosed = snapshots.some(s => s.year === year)

    const allSelected = nonZeroBalances.length > 0 && nonZeroBalances.every(b => settledIds.has(b.regular_member_id))

    function toggleMember(id: number) {
        setSettledIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function toggleAll() {
        if (allSelected) {
            setSettledIds(new Set())
        } else {
            setSettledIds(new Set(nonZeroBalances.map(b => b.regular_member_id)))
        }
    }

    async function startWizard() {
        setStep('preview')
    }

    async function handleConfirm() {
        setLoading(true)
        try {
            const settle = settledIds.size > 0 ? Array.from(settledIds) : []
            const result = await api.closeSeason(year, notes || undefined, settle)
            setSnapshot(result)
            setStep('done')
            showToast(t('season.done.title'))
        } catch (e) {
            toastError(e)
        } finally {
            setLoading(false)
        }
    }

    async function handleDownloadPdf() {
        try {
            await api.downloadReport(snapshot?.year ?? year, 'pdf')
            showToast(t('report.downloaded'))
        } catch (e) {
            toastError(e)
        }
    }

    function reset() {
        setStep('landing')
        setNotes('')
        setSnapshot(null)
        setSettledIds(new Set())
        qc.invalidateQueries({queryKey: ['season-snapshots']})
        qc.invalidateQueries({queryKey: ['season-balance-preview']})
        qc.invalidateQueries({queryKey: ['season-available-years']})
    }

    const yearOptions = availableYears.length > 0 ? availableYears : [currentYear]
    const settleCount = nonZeroBalances.filter(b => settledIds.has(b.regular_member_id)).length

    // ── Landing ────────────────────────────────────────────────────────────

    if (step === 'landing') {
        return (
            <div className="flex flex-col gap-4 pt-3">
                <div className="kce-card p-4 flex flex-col gap-4">
                    <h2 className="font-bold text-base text-kce-text">{t('season.title')}</h2>

                    <div className="flex items-center gap-3">
                        <label className="text-sm text-kce-muted whitespace-nowrap">{t('season.overview.year')}</label>
                        <select
                            className="kce-input flex-1"
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {alreadyClosed ? (
                        <p className="text-sm text-kce-muted bg-kce-surface2 rounded-lg px-3 py-2">
                            {t('season.alreadyClosed').replace('{year}', String(year))}
                        </p>
                    ) : (
                        <button
                            type="button"
                            className="btn-primary w-full"
                            onClick={startWizard}
                        >
                            {t('season.close').replace('{year}', String(year))}
                        </button>
                    )}
                </div>

                {/* History */}
                <div className="flex flex-col gap-3 mt-2">
                    <h3 className="sec-heading">{t('season.history')}</h3>
                    {snapsLoading ? (
                        <p className="text-sm text-kce-muted">{t('season.loading')}</p>
                    ) : snapshots.length === 0 ? (
                        <Empty icon="📋" text={t('season.noHistory')} />
                    ) : (
                        snapshots.map(s => (
                            <SnapshotCard key={s.id} snap={s} onReopened={reset} />
                        ))
                    )}
                </div>
            </div>
        )
    }

    // ── Preview (Step 1) ────────────────────────────────────────────────────

    if (step === 'preview') {
        return (
            <div className="flex flex-col gap-4 pt-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="text-kce-muted text-sm px-2 py-1 rounded bg-kce-surface2"
                        onClick={() => setStep('landing')}
                    >
                        ← {t('action.cancel')}
                    </button>
                    <h2 className="font-bold text-base text-kce-text">{t('season.step1.title')}</h2>
                </div>

                <p className="text-sm text-kce-muted">{t('season.step1.hint')}</p>

                {balancesLoading ? (
                    <div className="kce-card p-4">
                        <p className="text-sm text-kce-muted">{t('season.loading')}</p>
                    </div>
                ) : nonZeroBalances.length === 0 ? (
                    <div className="kce-card p-4">
                        <p className="text-sm text-green-400">{t('season.step1.noDebts')}</p>
                    </div>
                ) : (
                    <div className="kce-card px-4 flex flex-col gap-0 divide-y divide-kce-border">
                        {/* Select-all toggle */}
                        <div className="flex items-center justify-between py-2.5">
                            <span className="text-xs text-kce-muted font-medium">{t('season.step1.selectAll')}</span>
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                className="w-4 h-4 accent-kce-amber"
                            />
                        </div>
                        {nonZeroBalances.map(b => (
                            <div key={b.regular_member_id} className="flex items-center justify-between py-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={settledIds.has(b.regular_member_id)}
                                        onChange={() => toggleMember(b.regular_member_id)}
                                        className="w-4 h-4 accent-kce-amber flex-shrink-0"
                                    />
                                    <span className="text-sm text-kce-text truncate">{displayName(b)}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm flex-shrink-0">
                                    <span className={b.balance < 0 ? 'text-red-400' : 'text-green-400'}>
                                        {fe(b.balance)}
                                    </span>
                                    {settledIds.has(b.regular_member_id) && (
                                        <>
                                            <span className="text-kce-muted">→</span>
                                            <span className="text-kce-muted">0,00&nbsp;€</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <button
                    type="button"
                    className="btn-primary w-full"
                    onClick={() => setStep('confirm')}
                >
                    {t('action.continue')} →
                </button>
            </div>
        )
    }

    // ── Confirm (Step 2) ────────────────────────────────────────────────────

    if (step === 'confirm') {
        return (
            <div className="flex flex-col gap-4 pt-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="text-kce-muted text-sm px-2 py-1 rounded bg-kce-surface2"
                        onClick={() => setStep('preview')}
                    >
                        ←
                    </button>
                    <h2 className="font-bold text-base text-kce-text">{t('season.step2.title')}</h2>
                </div>

                <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2.5">
                    <p className="text-sm text-amber-400 font-medium">{t('season.step2.warning')}</p>
                </div>

                <div className="kce-card p-4 flex flex-col gap-2">
                    <p className="text-sm font-medium text-kce-text">{t('season.step2.actions')}</p>
                    <ul className="flex flex-col gap-1.5 mt-1">
                        <li className="text-sm text-kce-muted flex items-start gap-2">
                            <span className="mt-0.5">⚖️</span>
                            <span>
                                {settleCount > 0
                                    ? `${settleCount}× ${t('season.step2.actionBalances')}`
                                    : t('season.step1.noDebts')}
                            </span>
                        </li>
                        <li className="text-sm text-kce-muted flex items-start gap-2">
                            <span className="mt-0.5">🏆</span>
                            <span>{t('season.step2.actionRanking').replace('{year}', String(year))}</span>
                        </li>
                        <li className="text-sm text-kce-muted flex items-start gap-2">
                            <span className="mt-0.5">📦</span>
                            <span>{t('season.step2.actionEvenings')}</span>
                        </li>
                        <li className="text-sm text-kce-muted flex items-start gap-2">
                            <span className="mt-0.5">📄</span>
                            <span>{t('season.step2.actionReport')}</span>
                        </li>
                    </ul>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="field-label">{t('season.notes')}</label>
                    <input
                        type="text"
                        className="kce-input"
                        placeholder={t('season.notes')}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                    />
                </div>

                <button
                    type="button"
                    className="btn-primary w-full"
                    style={{background: loading ? undefined : '#c0392b'}}
                    disabled={loading}
                    onClick={handleConfirm}
                >
                    {loading ? t('season.loading') : t('season.confirm')}
                </button>
            </div>
        )
    }

    // ── Done ────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col gap-4 pt-3">
            <div className="kce-card p-4 flex flex-col gap-3 text-center">
                <div className="text-3xl">✓</div>
                <h2 className="font-bold text-base text-kce-text">{t('season.done.title')}</h2>
                <p className="text-sm text-kce-muted">{t('season.done.hint')}</p>
            </div>

            {snapshot && (
                <div className="kce-card p-4 grid grid-cols-2 gap-3">
                    <StatCell label={t('season.snapshot.members').replace('{n}', '').trim()} value={String(snapshot.member_count)} />
                    <StatCell label={t('season.snapshot.evenings').replace('{n}', '').trim()} value={String(snapshot.evening_count)} />
                    <StatCell label={t('season.snapshot.carryOver').replace('{n}', '').trim()} value={String(snapshot.carry_over_count)} />
                    <StatCell label={t('season.snapshot.penalties')} value={fe(snapshot.total_penalties)} />
                </div>
            )}

            <button type="button" className="btn-primary w-full" onClick={handleDownloadPdf}>
                {t('season.done.download')}
            </button>
            <button type="button" className="btn-secondary w-full" onClick={reset}>
                {t('season.done.back')}
            </button>
        </div>
    )
}

function StatCell({label, value}: {label: string; value: string}) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-xs text-kce-muted">{label}</span>
            <span className="text-sm font-bold text-kce-text">{value}</span>
        </div>
    )
}

function SnapshotCard({snap, onReopened}: {snap: SeasonSnapshot; onReopened: () => void}) {
    const t = useT()
    const [downloading, setDownloading] = useState(false)
    const [reopening, setReopening] = useState(false)
    const [confirmReopen, setConfirmReopen] = useState(false)

    async function download() {
        setDownloading(true)
        try {
            await api.downloadReport(snap.year, 'pdf')
        } catch (e) {
            toastError(e)
        } finally {
            setDownloading(false)
        }
    }

    async function handleReopen() {
        if (!confirmReopen) {
            setConfirmReopen(true)
            return
        }
        setReopening(true)
        try {
            await api.deleteSeasonSnapshot(snap.year)
            showToast(t('season.snapshot.reopenOk'))
            onReopened()
        } catch (e) {
            toastError(e)
        } finally {
            setReopening(false)
            setConfirmReopen(false)
        }
    }

    return (
        <div className="kce-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="font-bold text-kce-text">{t('season.snapshot.year').replace('{year}', String(snap.year))}</span>
                <span className="text-xs text-kce-muted">{fDate(snap.closed_at)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-kce-muted">
                <span>{t('season.snapshot.members').replace('{n}', String(snap.member_count))}</span>
                <span>{t('season.snapshot.evenings').replace('{n}', String(snap.evening_count))}</span>
                <span>{t('season.snapshot.carryOver').replace('{n}', String(snap.carry_over_count))}</span>
            </div>
            {snap.notes && <p className="text-xs text-kce-muted italic">{snap.notes}</p>}
            <button
                type="button"
                className="btn-secondary w-full text-xs py-1.5"
                disabled={downloading}
                onClick={download}
            >
                {downloading ? '…' : `📄 ${t('season.snapshot.download')}`}
            </button>
            {confirmReopen ? (
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-amber-400">
                        {t('season.snapshot.reopenConfirm').replace('{year}', String(snap.year))}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            className="flex-1 text-xs py-1.5 rounded-lg bg-red-900/50 text-red-400 font-medium"
                            disabled={reopening}
                            onClick={handleReopen}
                        >
                            {reopening ? '…' : t('season.snapshot.reopen')}
                        </button>
                        <button
                            type="button"
                            className="flex-1 text-xs py-1.5 rounded-lg bg-kce-surface2 text-kce-muted"
                            onClick={() => setConfirmReopen(false)}
                        >
                            {t('action.cancel')}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    className="text-xs py-1 text-kce-muted underline underline-offset-2 hover:text-amber-400 transition-colors"
                    onClick={() => setConfirmReopen(true)}
                >
                    {t('season.snapshot.reopen')}
                </button>
            )}
        </div>
    )
}
