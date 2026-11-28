import {useState} from 'react'
import {Users, X} from 'lucide-react'
import {useT} from '@/i18n'
import {useMediaQuery} from '@/hooks/useMediaQuery.ts'
import {Button} from '@/components/ui/Button.tsx'
import type {CaptureController, DrinkKind} from '@/hooks/useCaptureController.ts'
import type {Evening, EveningPlayer, PenaltyType} from '@/types.ts'
import {PlayerTile} from './PlayerTile.tsx'
import {PenaltyPad} from './PenaltyPad.tsx'
import {RecentList} from './RecentList.tsx'
import {DrinkPanel} from './DrinkPanel.tsx'
import {padCounts, sessionLines, type CaptureLine} from './captureView.ts'

export interface PlayerOverview {
    penaltyEuro: number
    gameScore: number | null
    beerCount: number
    shotsCount: number
}

interface CaptureBoardProps {
    capture: CaptureController
    evening: Evening
    /** In list order: the signed-in member first. */
    players: EveningPlayer[]
    penaltyGroups: Array<[number, PenaltyType[]]>
    penaltyTypes: PenaltyType[]
    overview: Map<number, PlayerOverview>
    currentPlayerId: number | null
    isMe: (p: EveningPlayer) => boolean
    displayName: (p: EveningPlayer) => string
    money: (amount: number) => string
    time: (ts: number) => string
}

/** The new design's quick entry: people · penalties · what just happened (see `lib/capture.ts`). */
export function CaptureBoard({
    capture, evening, players, penaltyGroups, penaltyTypes, overview, currentPlayerId, isMe, displayName, money, time,
}: CaptureBoardProps) {
    const t = useT()
    // Three columns on a landscape tablet, one below the other elsewhere
    const wide = useMediaQuery('(min-width: 1024px)', true)
    // `null`: capturing penalties. Otherwise a drink round is being put together.
    const [round, setRound] = useState<{ kind: DrinkKind; without: number[] } | null>(null)
    const {selected, tray, applied, multi} = capture.state
    const collecting = !round && tray.length > 0
    const joining = round ? players.filter(p => !round.without.includes(p.id)) : []

    const lines = sessionLines(capture, evening)
    const counts = padCounts(capture, lines, new Map(penaltyTypes.map(pt => [pt.name, pt.id])))

    const trayLines: CaptureLine[] = tray.flatMap((typeId, index) => {
        const type = penaltyTypes.find(pt => pt.id === typeId)
        return type ? [{
            key: `t${index}`, icon: type.icon, name: type.name, count: 1, value: type.default_amount,
            playerId: null, remove: () => capture.untray(index),
        }] : []
    })
    const rows = selected.length ? lines : trayLines
    const sum = rows.reduce((total, line) => total + line.value, 0)
    const nameOf = (id: number) => {
        const p = players.find(pl => pl.id === id)
        return p ? displayName(p) : '?'
    }

    const status = selected.length
        ? {kicker: t('capture.instant'), title: selected.length === 1 ? nameOf(selected[0]) : `${selected.length} ${t('capture.people')}`}
        : collecting
            ? {kicker: t(applied.length ? 'capture.nextPerson' : 'capture.unsaved'), title: t('capture.whoWasIt')}
            : {kicker: t('capture.nobody'), title: t('capture.ready')}

    const toggleRound = (id: number) => setRound(r => r && ({
        ...r, without: r.without.includes(id) ? r.without.filter(x => x !== id) : [...r.without, id],
    }))

    function startRound(kind: DrinkKind) {
        capture.release()
        setRound({kind, without: []})
    }

    const people = (
        <section aria-label={t('penalty.who')}
                 className={`flex flex-shrink-0 flex-col gap-2 border-line p-3 ${wide ? 'w-[19rem] overflow-y-auto border-r' : 'max-h-[34vh] overflow-y-auto border-b'}`}>
            <div className="flex min-h-11 items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-muted">{t(round ? 'capture.drinkWho' : 'penalty.who')}</h2>
                {round ? (
                    <div className="flex gap-1.5">
                        <Button type="button" onClick={() => setRound({...round, without: []})}>{t('action.all')}</Button>
                        <Button type="button" onClick={() => setRound({...round, without: players.map(p => p.id)})}>{t('action.none')}</Button>
                    </div>
                ) : (
                    <Button type="button" aria-pressed={multi}
                            className={multi ? '!border-accent !text-accent-fg' : ''}
                            onClick={capture.toggleMulti}>
                        <Users size={16} strokeWidth={2} aria-hidden="true"/> {t('capture.several')}
                    </Button>
                )}
            </div>
            <div className={`grid content-start gap-2 ${wide ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-4'}`}>
                {players.map(p => {
                    const o = overview.get(p.id)
                    const joins = round ? !round.without.includes(p.id) : false
                    const drinks = [
                        o?.beerCount ? `🍺 ${o.beerCount}` : '',
                        o?.shotsCount ? `🥃 ${o.shotsCount}` : '',
                        o?.gameScore != null ? `🎳 ${o.gameScore}` : '',
                    ].filter(Boolean).join(' · ')
                    const saving = capture.saving.filter(s => s.playerIds.includes(p.id))
                        .reduce((total, s) => total + s.type.default_amount * s.count, 0)
                    return (
                        <PlayerTile key={p.id} name={displayName(p)} isMe={isMe(p)} isKing={p.is_king}
                                    isCurrent={!round && currentPlayerId === p.id}
                                    pressed={round ? joins : selected.includes(p.id)}
                                    waiting={collecting} delivered={collecting && applied.includes(p.id)}
                                    holdKey={round ? undefined : capture.holdKey}
                                    value={money(o?.penaltyEuro ?? 0)}
                                    detail={round ? (joins ? '✓' : t('capture.drinkOut')) : drinks}
                                    pending={saving > 0 ? `+${money(saving)}` : undefined}
                                    onClick={() => round ? toggleRound(p.id) : capture.tapPlayer(p.id)}/>
                    )
                })}
            </div>
        </section>
    )

    /* What is selected or collected. On narrow screens it stays above the scrolling penalties,
       without the single lines — the recent entries below list those. */
    const statusPanel = (
        <div className={`flex flex-col gap-1 ${wide ? '' : 'flex-shrink-0 border-b border-line px-3 py-2'}`} data-testid="capture-status">
            <p className="flex justify-between gap-3 text-xs text-muted">
                <span>{status.kicker}</span>
                {!wide && rows.length > 0 && (
                    <span className="whitespace-nowrap font-bold text-ink">
                        {rows.reduce((n, l) => n + l.count, 0)} {t('capture.penalties')} · {money(sum)}
                    </span>
                )}
            </p>
            <div className="flex items-center justify-between gap-3">
                <h2 className="truncate font-display text-2xl font-bold" aria-live="polite">{status.title}</h2>
                {!wide && collecting && <Button type="button" onClick={capture.discard}>{t('capture.discard')}</Button>}
            </div>
            {wide && (rows.length > 0 ? (
                <>
                    <ul>
                        {rows.map(line => (
                            <li key={line.key} className="flex min-h-12 items-center gap-2 border-b border-line/70">
                                <span aria-hidden="true">{line.icon}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                                    {line.name}{line.count > 1 ? ` ×${line.count}` : ''}
                                    {selected.length > 1 && line.playerId != null && ` · ${nameOf(line.playerId)}`}
                                </span>
                                <span className="text-sm font-extrabold">{money(line.value)}</span>
                                {line.remove ? (
                                    <button type="button" onClick={line.remove}
                                            aria-label={`${t('capture.remove')}: ${line.name}`}
                                            className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg text-muted">
                                        <X size={18} strokeWidth={2} aria-hidden="true"/>
                                    </button>
                                ) : (
                                    <span className="w-11 text-center text-xs text-muted">{t('capture.saving')}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    <p className="flex items-baseline justify-between pt-1">
                        <span className="text-sm text-muted">
                            {rows.reduce((n, l) => n + l.count, 0)} {t('capture.penalties')}
                        </span>
                        <span className="font-display text-2xl font-bold">{money(sum)}</span>
                    </p>
                </>
            ) : (
                <p className="text-sm text-muted">{t(selected.length ? 'capture.hintSelected' : 'capture.hintIdle')}</p>
            ))}
            {wide && collecting && (
                <Button type="button" className="mt-1" onClick={capture.discard}>{t('capture.discard')}</Button>
            )}
        </div>
    )

    const pad = (
        <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5 border-b border-line pb-2.5">
                {(['beer', 'shots'] as const).map(kind => (
                    <button key={kind} type="button" onClick={() => startRound(kind)}
                            className="min-h-14 rounded-xl border border-line font-extrabold transition-transform active:scale-[.97]">
                        <span aria-hidden="true">{kind === 'beer' ? '🍺' : '🥃'}</span> {t(kind === 'beer' ? 'capture.beerRound' : 'capture.shotsRound')}
                    </button>
                ))}
            </div>
            <PenaltyPad layout="tablet" groups={penaltyGroups} counts={counts} money={money} onTap={capture.tapPenalty}/>
        </div>
    )

    const recent = (
        <RecentList capture={capture} evening={evening} players={players}
                    displayName={displayName} money={money} time={time}/>
    )

    return (
        <div data-testid="capture-board"
             className={`flex min-h-0 flex-1 overflow-hidden ${wide ? 'flex-row' : 'flex-col'}`}
             style={{paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)'}}>
            {people}
            {round ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
                    <DrinkPanel kind={round.kind} onKind={kind => setRound({...round, kind})}
                                joining={joining.length} total={players.length}
                                onCancel={() => setRound(null)}
                                onBook={() => {
                                    capture.bookDrinks(round.kind, joining.map(p => p.id))
                                    setRound(null)
                                }}
                                rounds={evening.drink_rounds} time={time}/>
                </div>
            ) : wide ? (
                <>
                    <section aria-label={t('capture.penalties')} className="min-w-0 flex-1 overflow-y-auto p-3">{pad}</section>
                    <aside className="flex w-[18rem] flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-line p-3">
                        {statusPanel}
                        {recent}
                    </aside>
                </>
            ) : (
                <>
                    {statusPanel}
                    <section aria-label={t('capture.penalties')} className="min-h-0 flex-1 overflow-y-auto p-3">
                        {pad}
                        <div className="pt-4">{recent}</div>
                    </section>
                </>
            )}
        </div>
    )
}
