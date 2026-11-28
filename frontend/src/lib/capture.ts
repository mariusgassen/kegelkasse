/**
 * The capture model of the new design (tablet quick entry and phone sheet). Two directions, no
 * confirm button:
 *
 *  - **person first** — with someone selected, every penalty tap books at once. The selection stays
 *    for the next tap and is released after a pause (`HOLD_MS`) or a second tap on the person.
 *  - **penalties first** — with nobody selected, taps collect in a tray. Tapping a person books the
 *    whole tray. Nothing collected is saved before that.
 *
 * "Several" lets both directions address more than one person. Pure and React-free; the hold timer
 * and the booking itself live in `hooks/useCapture.ts` and `hooks/useCaptureBooking.ts`.
 */

/** How long a selection survives without a tap before it lets go. */
export const HOLD_MS = 6000

export interface CaptureState {
    /** Evening player ids penalties are booked to right now. */
    selected: number[]
    multi: boolean
    /** Collected penalty type ids, one per tap. */
    tray: number[]
    /** With "several": who already received the current tray, so nobody gets it twice. */
    applied: number[]
}

export const EMPTY_CAPTURE: CaptureState = {selected: [], multi: false, tray: [], applied: []}

export type CaptureAction =
    | {type: 'penalty'; penaltyTypeId: number}
    | {type: 'player'; playerId: number}
    | {type: 'toggleMulti'}
    | {type: 'release'}
    | {type: 'discard'}
    | {type: 'untray'; index: number}
    /** Forget people and penalty types that no longer exist (removed on another device). */
    | {type: 'prune'; playerIds: number[]; penaltyTypeIds: number[]}

/** What has to be saved: every listed person receives every listed penalty. */
export interface Booking {
    playerIds: number[]
    penaltyTypeIds: number[]
}

export interface CaptureResult {
    state: CaptureState
    booking?: Booking
}

export function captureStep(state: CaptureState, action: CaptureAction): CaptureResult {
    switch (action.type) {
        case 'penalty': {
            if (state.selected.length) {
                return {state, booking: {playerIds: state.selected, penaltyTypeIds: [action.penaltyTypeId]}}
            }
            // A changed tray is a new one: everybody may receive it again
            return {state: {...state, tray: [...state.tray, action.penaltyTypeId], applied: []}}
        }
        case 'player': {
            const id = action.playerId
            if (state.tray.length) {
                if (state.multi && state.applied.includes(id)) return {state}
                const booking = {playerIds: [id], penaltyTypeIds: state.tray}
                return {
                    state: state.multi ? {...state, applied: [...state.applied, id]} : {...state, tray: [], applied: []},
                    booking,
                }
            }
            if (state.selected.includes(id)) return {state: {...state, selected: state.selected.filter(p => p !== id)}}
            return {state: {...state, selected: state.multi ? [...state.selected, id] : [id]}}
        }
        case 'toggleMulti': {
            if (!state.multi) return {state: {...state, multi: true}}
            // Leaving "several": a tray that has been handed out is done
            const spent = state.applied.length > 0
            return {state: {selected: [], multi: false, tray: spent ? [] : state.tray, applied: []}}
        }
        case 'release':
            if (!state.selected.length) return {state}
            return {state: {...state, selected: []}}
        case 'discard':
            return {state: {...state, tray: [], applied: []}}
        case 'untray':
            return {state: {...state, tray: state.tray.filter((_, i) => i !== action.index), applied: []}}
        case 'prune': {
            const selected = state.selected.filter(id => action.playerIds.includes(id))
            const tray = state.tray.filter(id => action.penaltyTypeIds.includes(id))
            const applied = state.applied.filter(id => action.playerIds.includes(id))
            if (selected.length === state.selected.length && tray.length === state.tray.length
                && applied.length === state.applied.length) return {state}
            return {state: {...state, selected, tray, applied: tray.length ? applied : []}}
        }
    }
}

/** Collected taps as "type × count", in the order each type was first tapped. */
export function countTray(penaltyTypeIds: number[]): Array<{penaltyTypeId: number; count: number}> {
    const counts = new Map<number, number>()
    for (const id of penaltyTypeIds) counts.set(id, (counts.get(id) ?? 0) + 1)
    return [...counts].map(([penaltyTypeId, count]) => ({penaltyTypeId, count}))
}
