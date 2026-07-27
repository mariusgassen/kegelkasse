import {describe, it, expect} from 'vitest'
import {
    dateTimeInputToIso,
    nowDateTimeInput,
    toDateInput,
    toDateTimeInput,
    todayDateInput,
} from '@/lib/datetime.ts'

/** The offset a `datetime-local` field would be wrong by if the value came from toISOString(). */
function offsetMinutes(d: Date) {
    return d.getTimezoneOffset()
}

describe('toDateInput', () => {
    it('formats a Date as the local calendar day', () => {
        expect(toDateInput(new Date(2026, 6, 27, 13, 45))).toBe('2026-07-27')
    })

    it('pads month and day', () => {
        expect(toDateInput(new Date(2026, 0, 5))).toBe('2026-01-05')
    })

    it('uses the local day, not the UTC one', () => {
        // 00:30 local on the 28th — in any timezone behind UTC this is still the 28th locally,
        // and in any timezone ahead of UTC toISOString() would report the 27th.
        const d = new Date(2026, 6, 28, 0, 30)
        expect(toDateInput(d)).toBe('2026-07-28')
        if (offsetMinutes(d) < 0) {
            expect(d.toISOString().slice(0, 10)).not.toBe(toDateInput(d))
        }
    })

    it('accepts an ISO string and a millisecond timestamp', () => {
        const d = new Date(2026, 6, 27, 13, 45)
        expect(toDateInput(d.toISOString())).toBe('2026-07-27')
        expect(toDateInput(d.getTime())).toBe('2026-07-27')
    })

    it('returns an empty string for a missing or unparseable value', () => {
        expect(toDateInput(null)).toBe('')
        expect(toDateInput(undefined)).toBe('')
        expect(toDateInput('')).toBe('')
        expect(toDateInput('not a date')).toBe('')
    })
})

describe('toDateTimeInput', () => {
    it('formats local wall-clock time to the minute', () => {
        expect(toDateTimeInput(new Date(2026, 6, 27, 9, 5))).toBe('2026-07-27T09:05')
    })

    it('shows the local clock, not UTC — this is the "end evening" prefill bug', () => {
        const d = new Date(2026, 6, 27, 21, 30)
        expect(toDateTimeInput(d)).toBe('2026-07-27T21:30')
        if (offsetMinutes(d) !== 0) {
            expect(d.toISOString().slice(0, 16)).not.toBe(toDateTimeInput(d))
        }
    })

    it('round-trips a timezone-aware ISO timestamp through the local clock', () => {
        const d = new Date(2026, 6, 27, 21, 30)
        expect(toDateTimeInput(d.toISOString())).toBe('2026-07-27T21:30')
    })

    it('returns an empty string for a missing value', () => {
        expect(toDateTimeInput(null)).toBe('')
        expect(toDateTimeInput(undefined)).toBe('')
    })
})

describe('dateTimeInputToIso', () => {
    it('interprets the field value as local time and emits a UTC instant', () => {
        expect(dateTimeInputToIso('2026-07-27T21:30'))
            .toBe(new Date(2026, 6, 27, 21, 30).toISOString())
    })

    it('always ends in Z so the backend does not read it as naive UTC', () => {
        expect(dateTimeInputToIso('2026-07-27T21:30')).toMatch(/Z$/)
    })

    it('round-trips with toDateTimeInput', () => {
        const iso = dateTimeInputToIso('2026-02-15T08:00')!
        expect(toDateTimeInput(iso)).toBe('2026-02-15T08:00')
    })

    it('returns undefined for an empty or invalid field', () => {
        expect(dateTimeInputToIso('')).toBeUndefined()
        expect(dateTimeInputToIso('nonsense')).toBeUndefined()
    })
})

describe('todayDateInput / nowDateTimeInput', () => {
    it('report the current local day and minute', () => {
        const now = new Date()
        expect(todayDateInput()).toBe(toDateInput(now))
        expect(nowDateTimeInput()).toBe(toDateTimeInput(now))
    })

    it('nowDateTimeInput starts with todayDateInput', () => {
        expect(nowDateTimeInput().startsWith(todayDateInput())).toBe(true)
    })
})
