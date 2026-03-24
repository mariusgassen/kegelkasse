/**
 * Unit tests for buildTurnOrder — player sequencing logic for games.
 */
import {describe, expect, it} from 'vitest'
import {buildTurnOrder} from '../turnOrder'
import type {EveningPlayer, Team} from '@/types'

function player(id: number, teamId: number | null = null): EveningPlayer {
    return {
        id,
        evening_id: 1,
        regular_member_id: id,
        name: `Player ${id}`,
        is_king: false,
        team_id: teamId,
        is_guest: false,
    } as EveningPlayer
}

function team(id: number): Team {
    return {id, name: `Team ${id}`, club_id: 1, sort_order: id, color: null} as Team
}

describe('buildTurnOrder — no teams', () => {
    it('returns all players in original order when no teams', () => {
        const players = [player(1), player(2), player(3)]
        const result = buildTurnOrder(players, [], 'alternating', 0)
        expect(result.map(p => p.id)).toEqual([1, 2, 3])
    })

    it('returns empty array when no players and no teams', () => {
        const result = buildTurnOrder([], [], 'alternating', 0)
        expect(result).toHaveLength(0)
    })
})

describe('buildTurnOrder — alternating mode', () => {
    it('interleaves two equal teams', () => {
        const t1 = team(1), t2 = team(2)
        const players = [player(1, 1), player(2, 1), player(3, 2), player(4, 2)]
        const result = buildTurnOrder(players, [t1, t2], 'alternating', 0)
        // T1[0], T2[0], T1[1], T2[1]
        expect(result.map(p => p.id)).toEqual([1, 3, 2, 4])
    })

    it('handles unequal team sizes', () => {
        const t1 = team(1), t2 = team(2)
        const players = [player(1, 1), player(2, 1), player(3, 1), player(4, 2)]
        const result = buildTurnOrder(players, [t1, t2], 'alternating', 0)
        // T1[0], T2[0], T1[1], T2 exhausted, T1[2]
        expect(result.map(p => p.id)).toEqual([1, 4, 2, 3])
    })

    it('appends unassigned players at end', () => {
        const t1 = team(1)
        const players = [player(1, 1), player(2, null), player(3, 1)]
        const result = buildTurnOrder(players, [t1], 'alternating', 0)
        // Team players first, then unassigned
        expect(result.map(p => p.id)).toContain(2)
        const idx2 = result.findIndex(p => p.id === 2)
        expect(idx2).toBeGreaterThan(0)
    })
})

describe('buildTurnOrder — block mode', () => {
    it('returns only the selected team players', () => {
        const t1 = team(1), t2 = team(2)
        const players = [player(1, 1), player(2, 1), player(3, 2), player(4, 2)]
        const result = buildTurnOrder(players, [t1, t2], 'block', 0)
        expect(result.map(p => p.id)).toEqual([1, 2])
    })

    it('wraps blockTeamIdx with modulo', () => {
        const t1 = team(1), t2 = team(2)
        const players = [player(1, 1), player(2, 2)]
        const result = buildTurnOrder(players, [t1, t2], 'block', 3)  // 3 % 2 = 1 → team2
        expect(result.map(p => p.id)).toEqual([2])
    })

    it('falls back to all players if selected team is empty', () => {
        const t1 = team(1), t2 = team(2)
        const players = [player(1, 1)]  // no players in team 2
        const result = buildTurnOrder(players, [t1, t2], 'block', 1)
        expect(result.map(p => p.id)).toEqual([1])
    })
})
