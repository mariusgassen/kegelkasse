import {describe, it, expect} from 'vitest'
import {throwTrackingEnabled} from '../clubSettings'
import type {ClubSettings} from '@/types'

const settings = (over: Partial<ClubSettings> = {}): ClubSettings => ({
    home_venue: null, logo_url: null, primary_color: '#e8a020', secondary_color: '#6b7c5a',
    bg_color: null, guest_penalty_cap: null, paypal_me: null, no_cancel_fee: null,
    pin_penalty: null, default_evening_time: null, ical_token: null, ...over,
})

describe('throwTrackingEnabled', () => {
    it('defaults to enabled when the flag is missing (club predates the setting)', () => {
        expect(throwTrackingEnabled(settings())).toBe(true)
    })

    it('defaults to enabled for null/undefined settings', () => {
        expect(throwTrackingEnabled(null)).toBe(true)
        expect(throwTrackingEnabled(undefined)).toBe(true)
    })

    it('is enabled when explicitly true', () => {
        expect(throwTrackingEnabled(settings({throw_tracking_enabled: true}))).toBe(true)
    })

    it('is disabled only when explicitly false', () => {
        expect(throwTrackingEnabled(settings({throw_tracking_enabled: false}))).toBe(false)
    })
})
