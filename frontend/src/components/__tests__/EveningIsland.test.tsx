import {describe, it, expect, vi} from 'vitest'
import {render, screen, act} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {Evening} from '@/types.ts'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/router', () => ({router: {navigate: vi.fn(() => Promise.resolve())}}))
vi.mock('@/api/client.ts', () => ({api: {getEvening: vi.fn()}}))

import EveningIsland, {elapsedLabel} from '../evening/EveningIsland'

function evening(overrides: Partial<Evening> = {}): Evening {
    return {
        id: 7, date: '2026-07-23', venue: 'Bahn 1', note: null, is_closed: false, ended_at: null,
        season_closed: false, players: [], teams: [], penalty_log: [], games: [], drink_rounds: [],
        highlights: [], ...overrides,
    }
}

function renderIsland(data: Evening | undefined) {
    const qc = new QueryClient()
    if (data) qc.setQueryData(['evening', 7], data)
    return render(<QueryClientProvider client={qc}><EveningIsland eveningId={7}/></QueryClientProvider>)
}

describe('EveningIsland', () => {
    it('announces the running evening as a live activity', async () => {
        renderIsland(evening())
        await act(async () => {})
        expect(screen.getByRole('button', {name: /island\.label/})).toBeTruthy()
    })

    it('shows no activity for a closed evening', async () => {
        renderIsland(evening({is_closed: true}))
        await act(async () => {})
        expect(screen.queryByRole('button', {name: /island\.label/})).toBeNull()
    })
})

describe('elapsedLabel', () => {
    const start = '2026-07-23T20:00:00Z'
    const at = (sec: number) => Date.parse(start) + sec * 1000
    it('formats m:ss and h:mm:ss', () => {
        expect(elapsedLabel(start, at(5))).toBe('0:05')
        expect(elapsedLabel(start, at(65))).toBe('1:05')
        expect(elapsedLabel(start, at(3725))).toBe('1:02:05')
    })
    it('never goes negative and tolerates missing/invalid starts', () => {
        expect(elapsedLabel(start, at(-30))).toBe('0:00')
        expect(elapsedLabel(null, at(5))).toBeNull()
        expect(elapsedLabel('nope', at(5))).toBeNull()
    })
})
