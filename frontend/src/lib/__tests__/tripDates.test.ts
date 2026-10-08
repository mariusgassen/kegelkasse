import {describe, it, expect} from 'vitest'
import {formatTripRange, isMultiDay, isTripPast, tripLastDay} from '../tripDates'

describe('isMultiDay', () => {
    it('is false without an end date or on the same day', () => {
        expect(isMultiDay('2025-08-10T00:00', null)).toBe(false)
        expect(isMultiDay('2025-08-10T10:00', '2025-08-10T00:00')).toBe(false)
    })
    it('is true when the end date is a later day', () => {
        expect(isMultiDay('2025-08-10T00:00', '2025-08-12T00:00')).toBe(true)
    })
})

describe('formatTripRange', () => {
    it('shows a single day for a one-day trip', () => {
        const out = formatTripRange('2025-08-10T00:00', null)
        expect(out).toContain('10.08.2025')
        expect(out).not.toContain('–')
    })
    it('shows both days for a range', () => {
        const out = formatTripRange('2025-08-10T00:00', '2025-08-12T00:00')
        expect(out).toContain('10.08.2025')
        expect(out).toContain('12.08.2025')
        expect(out).toContain('–')
    })
    it('collapses a same-day end date', () => {
        expect(formatTripRange('2025-08-10', '2025-08-10')).not.toContain('–')
    })
})

describe('tripLastDay / isTripPast', () => {
    it('uses the end date when set', () => {
        expect(tripLastDay('2025-08-10T00:00', '2025-08-12T00:00')).toBe('2025-08-12')
        expect(tripLastDay('2025-08-10T00:00', null)).toBe('2025-08-10')
    })
    it('keeps a running multi-day trip upcoming until its last day is over', () => {
        const midTrip = new Date('2025-08-11T12:00:00Z')
        expect(isTripPast('2025-08-10T00:00', '2025-08-12T00:00', midTrip)).toBe(false)
        expect(isTripPast('2025-08-10T00:00', null, midTrip)).toBe(true)
        expect(isTripPast('2025-08-10T00:00', '2025-08-12T00:00', new Date('2025-08-13T01:00:00Z'))).toBe(true)
    })
})
