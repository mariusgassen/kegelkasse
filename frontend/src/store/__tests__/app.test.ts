import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore, isAdmin } from '../app'
import type { User } from '../../types'

function makeUser(role: string): User {
    return {
        id: 1,
        email: 'test@test.de',
        name: 'Test User',
        username: 'testuser',
        role: role as User['role'],
        club_id: 1,
        preferred_locale: 'de',
        avatar: null,
        regular_member_id: null,
    }
}

describe('isAdmin helper', () => {
    it('returns false for null user', () => {
        expect(isAdmin(null)).toBe(false)
    })

    it('returns false for member role', () => {
        expect(isAdmin(makeUser('member'))).toBe(false)
    })

    it('returns true for admin role', () => {
        expect(isAdmin(makeUser('admin'))).toBe(true)
    })

    it('returns true for superadmin role', () => {
        expect(isAdmin(makeUser('superadmin'))).toBe(true)
    })
})

describe('useAppStore', () => {
    beforeEach(() => {
        useAppStore.setState({
            user: null,
            activeEveningId: null,
            penaltyTypes: [],
            regularMembers: [],
            gameTemplates: [],
            guestPenaltyCap: null,
        })
    })

    it('initializes with null user', () => {
        expect(useAppStore.getState().user).toBeNull()
    })

    it('initializes with null activeEveningId', () => {
        expect(useAppStore.getState().activeEveningId).toBeNull()
    })

    it('setUser updates the user', () => {
        const u = makeUser('member')
        useAppStore.getState().setUser(u)
        expect(useAppStore.getState().user).toEqual(u)
    })

    it('setUser accepts null to log out', () => {
        useAppStore.getState().setUser(makeUser('member'))
        useAppStore.getState().setUser(null)
        expect(useAppStore.getState().user).toBeNull()
    })

    it('setActiveEveningId stores the id', () => {
        useAppStore.getState().setActiveEveningId(42)
        expect(useAppStore.getState().activeEveningId).toBe(42)
    })

    it('setActiveEveningId accepts null', () => {
        useAppStore.getState().setActiveEveningId(42)
        useAppStore.getState().setActiveEveningId(null)
        expect(useAppStore.getState().activeEveningId).toBeNull()
    })

    it('setPenaltyTypes stores the list', () => {
        const types = [{ id: 1, name: 'Test', icon: '⚠️', default_amount: 1.0, sort_order: 0 }]
        useAppStore.getState().setPenaltyTypes(types)
        expect(useAppStore.getState().penaltyTypes).toHaveLength(1)
    })

    it('setRegularMembers stores the list', () => {
        const members = [{ id: 1, name: 'Hans', nickname: null, is_guest: false, is_active: true, is_committee: false, avatar: null }]
        useAppStore.getState().setRegularMembers(members)
        expect(useAppStore.getState().regularMembers).toHaveLength(1)
    })

    it('setGuestPenaltyCap stores the cap', () => {
        useAppStore.getState().setGuestPenaltyCap(5.0)
        expect(useAppStore.getState().guestPenaltyCap).toBe(5.0)
    })
})
