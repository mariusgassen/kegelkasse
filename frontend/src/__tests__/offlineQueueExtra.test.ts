import { describe, it, expect, beforeEach } from 'vitest'

// Use fake-indexeddb so the queue runs in jsdom without a real browser
import 'fake-indexeddb/auto'
import { offlineQueue, categorizeRequest, groupQueuedRequests } from '../offlineQueue'
import type { QueuedRequest } from '../offlineQueue'

beforeEach(async () => {
    await offlineQueue.clear()
})

// ── categorizeRequest ─────────────────────────────────────────────────────────

function req(method: string, path: string): QueuedRequest {
    return { id: 1, method, path, body: {}, timestamp: Date.now() }
}

describe('categorizeRequest', () => {
    it('classifies POST /evening as "evening"', () => {
        expect(categorizeRequest(req('POST', '/evening'))).toBe('evening')
    })

    it('classifies POST /schedule/5/start as "evening"', () => {
        expect(categorizeRequest(req('POST', '/schedule/5/start'))).toBe('evening')
    })

    it('classifies PATCH /evening/1 as "evening"', () => {
        expect(categorizeRequest(req('PATCH', '/evening/1'))).toBe('evening')
    })

    it('classifies POST /club/regular-members as "member"', () => {
        expect(categorizeRequest(req('POST', '/club/regular-members'))).toBe('member')
    })

    it('classifies POST /schedule/3/rsvp as "rsvp"', () => {
        expect(categorizeRequest(req('POST', '/schedule/3/rsvp'))).toBe('rsvp')
    })

    it('classifies DELETE /schedule/3/rsvp as "rsvp"', () => {
        expect(categorizeRequest(req('DELETE', '/schedule/3/rsvp'))).toBe('rsvp')
    })

    it('classifies POST /schedule/3/guests as "member"', () => {
        expect(categorizeRequest(req('POST', '/schedule/3/guests'))).toBe('member')
    })

    it('classifies POST /evening/1/penalties as "penalty"', () => {
        expect(categorizeRequest(req('POST', '/evening/1/penalties'))).toBe('penalty')
    })

    it('classifies DELETE /evening/-5/penalties/99 as "penalty"', () => {
        expect(categorizeRequest(req('DELETE', '/evening/-5/penalties/99'))).toBe('penalty')
    })

    it('classifies POST /evening/42/drinks as "drink"', () => {
        expect(categorizeRequest(req('POST', '/evening/42/drinks'))).toBe('drink')
    })

    it('classifies POST /evening/42/games as "game"', () => {
        expect(categorizeRequest(req('POST', '/evening/42/games'))).toBe('game')
    })

    it('classifies POST /evening/42/players as "player"', () => {
        expect(categorizeRequest(req('POST', '/evening/42/players'))).toBe('player')
    })

    it('classifies POST /evening/42/highlights as "highlight"', () => {
        expect(categorizeRequest(req('POST', '/evening/42/highlights'))).toBe('highlight')
    })

    it('classifies POST /evening/42/teams as "team"', () => {
        expect(categorizeRequest(req('POST', '/evening/42/teams'))).toBe('team')
    })

    it('classifies unknown paths as "other"', () => {
        expect(categorizeRequest(req('POST', '/auth/login'))).toBe('other')
        expect(categorizeRequest(req('GET', '/club'))).toBe('other')
    })
})

// ── groupQueuedRequests ───────────────────────────────────────────────────────

describe('groupQueuedRequests', () => {
    it('returns empty object when queue is empty', async () => {
        const groups = await groupQueuedRequests()
        expect(groups).toEqual({})
    })

    it('counts items by category', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/penalties', {})
        await offlineQueue.enqueue('POST', '/evening/1/penalties', {})
        await offlineQueue.enqueue('POST', '/evening/1/drinks', {})
        await offlineQueue.enqueue('POST', '/evening/1/games', {})

        const groups = await groupQueuedRequests()
        expect(groups.penalty).toBe(2)
        expect(groups.drink).toBe(1)
        expect(groups.game).toBe(1)
    })

    it('handles mixed categories', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/players', {})
        await offlineQueue.enqueue('POST', '/evening/1/highlights', {})
        await offlineQueue.enqueue('POST', '/schedule/5/rsvp', {})

        const groups = await groupQueuedRequests()
        expect(groups.player).toBe(1)
        expect(groups.highlight).toBe(1)
        expect(groups.rsvp).toBe(1)
    })
})
