import {useCallback, useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {offlineQueue} from '@/offlineQueue.ts'
import {captureStep, countTray, EMPTY_CAPTURE, HOLD_MS, type Booking, type CaptureAction, type CaptureState} from '@/lib/capture.ts'
import {announceQuickEntryEvent} from '@/lib/quickEntryEvents.ts'
import {playSound} from '@/lib/soundboard'
import {haptic} from '@/lib/haptics.ts'
import {useAudioCallouts} from '@/hooks/useClub.ts'
import {toastError} from '@/utils/error.ts'
import type {Evening, EveningPlayer, PenaltyType} from '@/types.ts'

export type DrinkKind = 'beer' | 'shots'

/** A booking younger than this was never announced to the member, so removing it needs no question
 *  (mirrors `QUICK_CORRECTION_SECONDS` on the server). */
export const FRESH_MS = 60_000

/** A booking that has been sent but is not part of the evening data yet. */
export interface SavingBooking {
    ts: number
    playerIds: number[]
    type: PenaltyType
    count: number
}

/** `null`: queued offline. `'failed'`: never saved. */
type SaveResult = number[] | null | 'failed'

interface Sent {
    ts: number
    kind: 'penalties' | 'drinks'
    done: Promise<SaveResult>
}

export interface CaptureControllerOptions {
    eveningId: number
    evening: Evening | null | undefined
    invalidate: () => Promise<unknown> | void
    cancelPendingItem: (id: number, type: 'penalty' | 'drink') => Promise<void>
    players: EveningPlayer[]
    penaltyTypes: PenaltyType[]
    displayName: (p: EveningPlayer) => string
    /** Format an amount in euros. */
    money: (amount: number) => string
}

let lastTimestamp = 0
/** Strictly increasing, so that every booking can be found again by its client timestamp. */
function nextTimestamp(): number {
    lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)
    return lastTimestamp
}

/**
 * Everything behind the new capture screens: the selection model with its hold timer, saving each
 * booking the moment it is made (taps are never dropped while another is still saving), and taking
 * bookings back — whether they already reached the server, are still on their way or wait offline.
 */
export function useCaptureController(options: CaptureControllerOptions) {
    const t = useT()
    const qc = useQueryClient()
    const audioCallouts = useAudioCallouts()
    const optionsRef = useRef(options)
    optionsRef.current = options

    const [state, setState] = useState<CaptureState>(EMPTY_CAPTURE)
    // Mirrors `state` synchronously: two taps can arrive before React has rendered the first
    const stateRef = useRef(state)
    /** Changes with every tap on a selection; restarts the hold timer and its bar. */
    const [holdKey, setHoldKey] = useState(0)
    const [saving, setSaving] = useState<SavingBooking[]>([])
    /** Client timestamps booked to the current selection, newest last. */
    const [session, setSession] = useState<number[]>([])

    const refresh = useCallback(async () => {
        await optionsRef.current.invalidate()
        qc.invalidateQueries({queryKey: ['member-balances']})
        qc.invalidateQueries({queryKey: ['guest-balances']})
    }, [qc])

    const nameOf = (ids: number[]) => ids.length === 1
        ? (() => {
            const p = optionsRef.current.players.find(pl => pl.id === ids[0])
            return p ? optionsRef.current.displayName(p) : '?'
        })()
        : `${ids.length} ${t('capture.people')}`

    /** Takes one sent request back, wherever it is by now. */
    const takeBack = useCallback(async (sent: Sent) => {
        const ids = await sent.done
        if (ids === 'failed') return
        const {eveningId} = optionsRef.current
        const remove = (id: number) => sent.kind === 'penalties'
            ? api.deletePenalty(eveningId, id)
            : api.deleteDrinkRound(eveningId, id)
        if (ids) {
            await Promise.all(ids.map(remove))
        } else {
            const queued = (await offlineQueue.getAll()).filter(q =>
                q.path === `/evening/${eveningId}/${sent.kind}`
                && (q.body as {client_timestamp?: number}).client_timestamp === sent.ts)
            if (queued.length) {
                for (const q of queued) await offlineQueue.remove(q.id!)
                window.dispatchEvent(new CustomEvent('kegelkasse:queue-changed'))
            } else {
                // Synced in the meantime: the server's entries carry the same client timestamp
                const evening = optionsRef.current.evening
                const entries = sent.kind === 'penalties' ? evening?.penalty_log : evening?.drink_rounds
                await Promise.all((entries ?? []).filter(e => e.client_timestamp === sent.ts && e.id > 0)
                    .map(e => remove(e.id)))
            }
        }
        await refresh()
    }, [refresh])

    const announceUndo = useCallback((sent: Sent[]) => () => {
        Promise.all(sent.map(takeBack))
            .then(() => announceQuickEntryEvent({
                kind: 'undo', icon: '↩️', title: t('capture.undone'), subtitle: '', badge: '✕',
            }))
            .catch(toastError)
    }, [takeBack, t])

    const book = useCallback((booking: Booking) => {
        const {eveningId, penaltyTypes, money} = optionsRef.current
        const items = countTray(booking.penaltyTypeIds).flatMap(({penaltyTypeId, count}) => {
            const type = penaltyTypes.find(pt => pt.id === penaltyTypeId)
            return type ? [{type, count}] : []
        })
        if (!items.length) return [] as number[]
        const sent: Sent[] = items.map(({type, count}) => {
            const ts = nextTimestamp()
            setSaving(list => [...list, {ts, playerIds: booking.playerIds, type, count}])
            const done: Promise<SaveResult> = api.addPenalty(eveningId, {
                player_ids: booking.playerIds,
                penalty_type_name: type.name,
                icon: type.icon,
                amount: count,
                mode: 'count',
                unit_amount: type.default_amount,
                client_timestamp: ts,
            }).then(
                created => created ? created.map(c => c.id) : null,
                (e: unknown) => {
                    toastError(e)
                    return 'failed' as const
                },
            )
            done.then(refresh).catch(() => {}).finally(() => setSaving(list => list.filter(s => s.ts !== ts)))
            return {ts, kind: 'penalties', done}
        })
        if (audioCallouts) playSound(items[items.length - 1].type.sound_key)
        haptic('success')
        const total = items.reduce((sum, i) => sum + i.type.default_amount * i.count, 0) * booking.playerIds.length
        const one = items.length === 1 && items[0].count === 1
        const pieces = items.reduce((sum, i) => sum + i.count, 0)
        announceQuickEntryEvent({
            kind: 'penalty',
            icon: items.length === 1 ? items[0].type.icon : '🎳',
            title: one || items.length === 1
                ? `${items[0].type.name}${items[0].count > 1 ? ` ×${items[0].count}` : ''}`
                : `${pieces} ${t('capture.penalties')}`,
            subtitle: nameOf(booking.playerIds),
            badge: `+${money(total)}`,
            undo: announceUndo(sent),
        })
        return sent.map(s => s.ts)
    }, [audioCallouts, announceUndo, refresh, t])

    const dispatch = useCallback((action: CaptureAction) => {
        const before = stateRef.current
        const result = captureStep(before, action)
        stateRef.current = result.state
        setState(result.state)
        if (action.type !== 'prune') setHoldKey(k => k + 1)
        const sameSelection = before.selected.join() === result.state.selected.join()
        if (!sameSelection) setSession([])
        if (result.booking) {
            const stamps = book(result.booking)
            // Only what was booked to a standing selection belongs to its list
            if (result.state.selected.length && sameSelection) setSession(list => [...list, ...stamps])
        }
    }, [book])

    const holding = state.selected.length > 0
    useEffect(() => {
        if (!holding) return
        const timer = setTimeout(() => dispatch({type: 'release'}), HOLD_MS)
        return () => clearTimeout(timer)
    }, [holding, holdKey, dispatch])

    const playerIds = options.players.map(p => p.id).join()
    const typeIds = options.penaltyTypes.map(pt => pt.id).join()
    useEffect(() => {
        const {players, penaltyTypes} = optionsRef.current
        if (!players.length || !penaltyTypes.length) return  // still loading
        dispatch({type: 'prune', playerIds: players.map(p => p.id), penaltyTypeIds: penaltyTypes.map(pt => pt.id)})
    }, [playerIds, typeIds, dispatch])

    const bookDrinks = useCallback((kind: DrinkKind, participantIds: number[]) => {
        const {eveningId} = optionsRef.current
        const ts = nextTimestamp()
        const done: Promise<SaveResult> = api.addDrinkRound(eveningId, {
            drink_type: kind, participant_ids: participantIds, client_timestamp: ts,
        }).then(
            round => round ? [round.id] : null,
            (e: unknown) => {
                toastError(e)
                return 'failed' as const
            },
        )
        done.then(refresh).catch(() => {})
        haptic('success')
        announceQuickEntryEvent({
            kind: 'drink',
            icon: kind === 'beer' ? '🍺' : '🥃',
            title: t(kind === 'beer' ? 'drinks.beer' : 'drinks.shots'),
            subtitle: nameOf(participantIds),
            badge: `${participantIds.length}×`,
            undo: announceUndo([{ts, kind: 'drinks', done}]),
        })
    }, [announceUndo, refresh, t])

    /** Removes one saved or queued entry (the list rows' ✕). */
    const removeEntry = useCallback(async (id: number, kind: 'penalty' | 'drink') => {
        const {eveningId, cancelPendingItem} = optionsRef.current
        try {
            if (id < 0) {
                await cancelPendingItem(id, kind)
            } else {
                await (kind === 'penalty' ? api.deletePenalty(eveningId, id) : api.deleteDrinkRound(eveningId, id))
                await refresh()
            }
            announceQuickEntryEvent({kind: 'undo', icon: '↩️', title: t('capture.undone'), subtitle: '', badge: '✕'})
        } catch (e: unknown) {
            toastError(e)
        }
    }, [refresh, t])

    return {
        state,
        holdKey,
        saving,
        session,
        tapPenalty: (penaltyTypeId: number) => dispatch({type: 'penalty', penaltyTypeId}),
        tapPlayer: (playerId: number) => dispatch({type: 'player', playerId}),
        toggleMulti: () => dispatch({type: 'toggleMulti'}),
        release: () => dispatch({type: 'release'}),
        discard: () => dispatch({type: 'discard'}),
        untray: (index: number) => dispatch({type: 'untray', index}),
        bookDrinks,
        removeEntry,
    }
}

export type CaptureController = ReturnType<typeof useCaptureController>
