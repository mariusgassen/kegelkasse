// @vitest-environment node
import {describe, expect, it} from 'vitest'
import {
    configEuro, configExportedAt, renderClubConfigPdf, soundLabel, templateFlags, templateMode, yesNo,
} from '../clubConfigPdf'
import type {ClubConfigBundle} from '@/types'

const BUNDLE: ClubConfigBundle = {
    version: 1,
    club_name: 'KC Müller & Söhne',
    exported_at: '2025-04-01T18:00:00Z',
    settings: {
        home_venue: 'Krone', primary_color: '#111111', secondary_color: '#222222',
        bg_color: '#333333', guest_penalty_cap: 5, no_cancel_fee: 1.5,
        pin_penalty: 2, default_evening_time: '20:00',
        throw_tracking_enabled: false, audio_callouts_enabled: true,
    },
    penalty_types: [
        {icon: '🎳', name: 'Null', default_amount: 1, sound_key: 'buzzer'},
        {icon: '⚠️', name: 'Zu spät', default_amount: 2.5, sound_key: null},
    ],
    game_templates: [{
        name: 'Klassiker', description: null, winner_type: 'individual', turn_mode: null,
        is_opener: true, is_president_game: false, default_loser_penalty: 1, per_point_penalty: 0,
        sort_order: 0,
    }],
    teams: [{name: 'Team A', sort_order: 0}],
    pins: [{name: 'Vereinsnadel', icon: '📌'}],
}

describe('configEuro', () => {
    it('formats amounts in Euro and uses a dash for unset values', () => {
        expect(configEuro(2.5)).toBe('2,50 €')
        expect(configEuro(null)).toBe('–')
        expect(configEuro(undefined)).toBe('–')
    })
})

describe('soundLabel', () => {
    it('uses the German preset label, never the raw key or an emoji', () => {
        expect(soundLabel('buzzer')).toBe('Buzzer')
        expect(soundLabel(null)).toBe('–')
        expect(soundLabel('unknown_sound')).toBe('unknown_sound')
    })
})

describe('yesNo', () => {
    it('resolves legacy null toggles through their default', () => {
        expect(yesNo(true, true)).toBe('Ja')
        expect(yesNo(false, true)).toBe('Nein')
        expect(yesNo(null, true)).toBe('Ja')
        expect(yesNo(null, false)).toBe('Nein')
    })
})

describe('templateMode / templateFlags', () => {
    it('describes winner type, turn mode and special flags', () => {
        expect(templateMode(BUNDLE.game_templates[0])).toBe('Einzel')
        expect(templateMode({...BUNDLE.game_templates[0], winner_type: 'team', turn_mode: 'block'}))
            .toBe('Team · Block')
        expect(templateFlags(BUNDLE.game_templates[0])).toBe('Eröffnung')
        expect(templateFlags({...BUNDLE.game_templates[0], is_opener: false, is_president_game: true}))
            .toBe('Präsident')
        expect(templateFlags({...BUNDLE.game_templates[0], is_opener: false})).toBe('')
    })
})

describe('configExportedAt', () => {
    it('renders the export timestamp in German local-style formatting', () => {
        expect(configExportedAt('2025-04-01T18:00:00Z')).toMatch(/01\.04\.2025/)
        expect(configExportedAt('not-a-date')).toBe('')
    })
})

describe('renderClubConfigPdf', () => {
    it('renders a PDF with the club configuration', async () => {
        const bytes = await renderClubConfigPdf(BUNDLE)
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
        expect(bytes.length).toBeGreaterThan(2000)
    })

    it('renders with club branding', async () => {
        const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        const bytes = await renderClubConfigPdf(BUNDLE, {color: '#e8a020', logo: {src: tinyPng, width: 1, height: 1}})
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    })

    it('renders an empty config without throwing', async () => {
        const empty: ClubConfigBundle = {
            ...BUNDLE, club_name: null, exported_at: null,
            settings: Object.fromEntries(Object.keys(BUNDLE.settings).map(k => [k, null])) as unknown as ClubConfigBundle['settings'],
            penalty_types: [], game_templates: [], teams: [], pins: [],
        }
        const bytes = await renderClubConfigPdf(empty)
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    })
})
