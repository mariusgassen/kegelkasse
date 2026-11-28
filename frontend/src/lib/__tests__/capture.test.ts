import {describe, expect, it} from 'vitest'
import {captureStep, countTray, EMPTY_CAPTURE, type CaptureAction, type CaptureState} from '../capture'

const tap = (penaltyTypeId: number): CaptureAction => ({type: 'penalty', penaltyTypeId})
const person = (playerId: number): CaptureAction => ({type: 'player', playerId})

/** Plays a sequence and returns the final state plus everything that had to be booked. */
function play(...actions: CaptureAction[]) {
    let state: CaptureState = EMPTY_CAPTURE
    const bookings: Array<[number[], number[]]> = []
    for (const action of actions) {
        const result = captureStep(state, action)
        state = result.state
        if (result.booking) bookings.push([result.booking.playerIds, result.booking.penaltyTypeIds])
    }
    return {state, bookings}
}

describe('person first', () => {
    it('books every tap at once and keeps the person selected', () => {
        const {state, bookings} = play(person(1), tap(10), tap(10), tap(11))
        expect(bookings).toEqual([[[1], [10]], [[1], [10]], [[1], [11]]])
        expect(state.selected).toEqual([1])
    })

    it('switches to the next person tapped', () => {
        expect(play(person(1), person(2), tap(10)).bookings).toEqual([[[2], [10]]])
    })

    it('releases on a second tap, so the next penalty is collected instead of booked', () => {
        const {state, bookings} = play(person(1), person(1), tap(10))
        expect(bookings).toEqual([])
        expect(state).toMatchObject({selected: [], tray: [10]})
    })

    it('releases after the pause', () => {
        expect(play(person(1), {type: 'release'}, tap(10)).bookings).toEqual([])
    })
})

describe('penalties first', () => {
    it('saves nothing until a person is tapped, then the whole tray', () => {
        expect(play(tap(10), tap(11), tap(10)).bookings).toEqual([])
        const {state, bookings} = play(tap(10), tap(11), tap(10), person(2))
        expect(bookings).toEqual([[[2], [10, 11, 10]]])
        expect(state).toEqual(EMPTY_CAPTURE)
    })

    it('does not lose the tray when a selection times out', () => {
        expect(play(tap(10), {type: 'release'}).state.tray).toEqual([10])
    })

    it('can drop single entries or everything', () => {
        expect(play(tap(10), tap(11), {type: 'untray', index: 0}).state.tray).toEqual([11])
        expect(play(tap(10), tap(11), {type: 'discard'}).state.tray).toEqual([])
    })
})

describe('several people', () => {
    const several: CaptureAction = {type: 'toggleMulti'}

    it('books one penalty to everyone selected', () => {
        expect(play(several, person(1), person(2), tap(10)).bookings).toEqual([[[1, 2], [10]]])
    })

    it('hands the tray to each person once', () => {
        const {state, bookings} = play(several, tap(10), person(1), person(2), person(2))
        expect(bookings).toEqual([[[1], [10]], [[2], [10]]])
        expect(state.applied).toEqual([1, 2])
    })

    it('treats a changed tray as new', () => {
        const {bookings} = play(several, tap(10), person(1), tap(11), person(1))
        expect(bookings).toEqual([[[1], [10]], [[1], [10, 11]]])
    })

    it('clears a handed-out tray on leaving, but keeps an untouched one', () => {
        expect(play(several, tap(10), person(1), several).state).toEqual(EMPTY_CAPTURE)
        expect(play(several, tap(10), several).state).toMatchObject({multi: false, tray: [10]})
    })

    it('releases the selection on leaving', () => {
        expect(play(several, person(1), person(2), several).state.selected).toEqual([])
    })
})

describe('prune', () => {
    it('forgets people and penalty types that disappeared', () => {
        const {state} = play({type: 'toggleMulti'}, person(1), person(2),
            {type: 'prune', playerIds: [2], penaltyTypeIds: [10]})
        expect(state.selected).toEqual([2])
        expect(play(tap(10), tap(99), {type: 'prune', playerIds: [], penaltyTypeIds: [10]}).state.tray).toEqual([10])
    })

    it('returns the same state when nothing changed', () => {
        const state = {...EMPTY_CAPTURE, selected: [1]}
        expect(captureStep(state, {type: 'prune', playerIds: [1], penaltyTypeIds: []}).state).toBe(state)
    })
})

describe('countTray', () => {
    it('groups taps by type in first-tapped order', () => {
        expect(countTray([11, 10, 11])).toEqual([{penaltyTypeId: 11, count: 2}, {penaltyTypeId: 10, count: 1}])
    })
})
