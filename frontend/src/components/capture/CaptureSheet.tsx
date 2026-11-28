import {useState} from 'react'
import {useT} from '@/i18n'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {Button} from '@/components/ui/Button.tsx'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'
import {useCaptureController} from '@/hooks/useCaptureController.ts'
import {useAppStore} from '@/store/app.ts'
import {sortPenaltyTypes} from '@/lib/penaltyTypes.ts'
import type {Evening, EveningPlayer} from '@/types.ts'
import {PenaltyPad} from './PenaltyPad.tsx'
import {HoldBar} from './PlayerTile.tsx'
import {padCounts, sessionLines} from './captureView.ts'

const money = (v: number) => new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(v)

interface CaptureSheetProps {
    evening: Evening
    invalidate: () => Promise<unknown> | void
    cancelPendingItem: (id: number, type: 'penalty' | 'drink') => Promise<boolean>
    onClose: () => void
    /** Opens the form for a penalty that is not on the list, or an amount in euros. */
    onCustom: () => void
}

/** The new design's "record penalties" sheet on phones; same model as the quick entry. */
export function CaptureSheet({evening, invalidate, cancelPendingItem, onClose, onCustom}: CaptureSheetProps) {
    const t = useT()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const regularMembers = useAppStore(s => s.regularMembers)
    const myMemberId = useAppStore(s => s.user?.regular_member_id)
    const [leaving, setLeaving] = useState<(() => void) | null>(null)

    const displayName = (p: EveningPlayer) =>
        p.nickname || regularMembers.find(m => m.id === p.regular_member_id)?.nickname || p.name
    const isMe = (p: EveningPlayer) => myMemberId != null && p.regular_member_id === myMemberId
    const players = [...evening.players].sort((a, b) =>
        Number(isMe(b)) - Number(isMe(a)) || displayName(a).localeCompare(displayName(b)))

    const capture = useCaptureController({
        eveningId: evening.id, evening, invalidate, cancelPendingItem, players, penaltyTypes, displayName, money,
        // The sheet covers what an opened island would show; its footer takes bookings back instead
        receiptUndo: false,
    })
    const {selected, tray, applied, multi} = capture.state
    const collecting = tray.length > 0
    const lines = sessionLines(capture, evening)
    const counts = padCounts(capture, lines, new Map(penaltyTypes.map(pt => [pt.name, pt.id])))
    const sorted = sortPenaltyTypes(penaltyTypes)
    const trayValue = tray.reduce((sum, id) => sum + (penaltyTypes.find(pt => pt.id === id)?.default_amount ?? 0), 0)
    const nameOf = (id: number) => {
        const p = players.find(pl => pl.id === id)
        return p ? displayName(p) : '?'
    }
    const namesOf = (ids: number[]) => ids.length === 1 ? nameOf(ids[0]) : `${ids.length} ${t('capture.people')}`
    const {last} = capture
    const lastText = last && `${t('capture.last')}: ${namesOf(last.playerIds)} · ${
        last.items.map(i => `${i.type.name}${i.count > 1 ? ` ×${i.count}` : ''}`).join(', ')}`
    // While a tray is being collected, discarding comes first; once handed out it can be taken back too
    const canUndo = !!last && (!collecting || applied.length > 0)

    /** Collected penalties are not saved yet: ask before throwing them away. */
    const leave = (then: () => void) => collecting && !applied.length ? setLeaving(() => then) : then()

    const title = collecting ? t('capture.whoWasIt')
        : selected.length ? namesOf(selected)
            : t('capture.nobody')
    const detail = collecting
        ? `${tray.length} ${t('capture.collected')} · ${money(trayValue)} · ${t('capture.unsaved')}`
        : lines.length
            ? `${lines.reduce((n, l) => n + l.count, 0)} ${t('capture.penalties')} · ${money(lines.reduce((s, l) => s + l.value, 0))} ${t('capture.saved')}`
            : lastText ?? t('capture.prompt')

    return (
        <>
            <Sheet open onClose={() => leave(onClose)} title={t('capture.title')}>
                <div className="flex items-center justify-end pb-2">
                    <Button type="button" aria-pressed={multi} className={multi ? '!border-accent !text-accent-fg' : ''}
                            onClick={capture.toggleMulti}>
                        {t('capture.several')}
                    </Button>
                </div>
                <div role="group" aria-label={t('penalty.who')} className="grid grid-cols-3 gap-1.5 border-b border-line pb-3">
                    {players.map(p => {
                        const on = selected.includes(p.id)
                        const done = collecting && applied.includes(p.id)
                        return (
                            <button key={p.id} type="button" aria-pressed={on} onClick={() => capture.tapPlayer(p.id)}
                                    className={`relative flex min-h-11 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-xl border-2 px-1 text-sm font-extrabold transition-transform active:scale-[.97] ${on ? 'border-accent bg-accent text-on-accent' : done ? 'border-accent bg-accent-tint' : collecting ? 'border-dashed border-accent' : 'border-line'}`}>
                                <span className="truncate">{displayName(p)}</span>
                                {done && <span aria-label={t('capture.delivered')}>✓</span>}
                                {isMe(p) && <MeBadge/>}
                                {on && <HoldBar holdKey={capture.holdKey}/>}
                            </button>
                        )
                    })}
                </div>
                <div className="py-3">
                    <PenaltyPad layout="phone" groups={[[0, sorted]]} counts={counts} money={money}
                                onTap={capture.tapPenalty} onCustom={() => leave(onCustom)}/>
                </div>
                {/* The pseudo-element covers the panel's bottom padding, where the pad would show through */}
                <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-line bg-surface px-4 py-3 after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-surface after:content-['']"
                     data-testid="capture-footer">
                    <p className="min-w-0 flex-1" aria-live="polite">
                        <span className="block truncate font-extrabold">{title}</span>
                        <span className="block text-xs text-muted">{detail}</span>
                    </p>
                    {canUndo && (
                        <Button type="button" disabled={capture.undoing} onClick={capture.undoLast}>
                            {t('capture.undoLast')}
                        </Button>
                    )}
                    {collecting && <Button type="button" onClick={capture.discard}>{t('capture.discard')}</Button>}
                </div>
            </Sheet>
            {leaving && (
                <ConfirmSheet open withCancel title={t('capture.discardTitle')} message={t('capture.discardMessage')}
                              confirmLabel={t('capture.discard')}
                              onClose={() => setLeaving(null)} onConfirm={leaving}/>
            )}
        </>
    )
}
