import { describe, it, expect, beforeEach } from 'vitest'
import {
    useAppStore,
    isAdmin,
    isSuperadmin,
    isItAdmin,
    isTreasurer,
    isAuditor,
    isCommittee,
    isZeugwart,
    canManageRoadmap,
    hasRole,
} from '../app'
import type { User, UserRole } from '../../types'

function makeUser(role: UserRole, roles?: UserRole[]): User {
    return {
        id: 1,
        email: 'test@test.de',
        name: 'Test User',
        username: 'testuser',
        role,
        roles: roles ?? [role],
        club_id: 1,
        preferred_locale: 'de',
        avatar: null,
        regular_member_id: null,
    }
}

describe('role helpers', () => {
    it('returns false for null user', () => {
        expect(isAdmin(null)).toBe(false)
        expect(isSuperadmin(null)).toBe(false)
        expect(isItAdmin(null)).toBe(false)
        expect(isTreasurer(null)).toBe(false)
        expect(isAuditor(null)).toBe(false)
        expect(isCommittee(null)).toBe(false)
        expect(isZeugwart(null)).toBe(false)
        expect(canManageRoadmap(null)).toBe(false)
    })

    it('handles single roles and superadmin hierarchy', () => {
        expect(isAdmin(makeUser('member'))).toBe(false)
        expect(isAdmin(makeUser('admin'))).toBe(true)
        expect(isAdmin(makeUser('superadmin'))).toBe(true)
        expect(isSuperadmin(makeUser('superadmin'))).toBe(true)
        expect(isSuperadmin(makeUser('admin'))).toBe(false)
        expect(isItAdmin(makeUser('it_admin'))).toBe(true)
        expect(isItAdmin(makeUser('superadmin'))).toBe(true)
        expect(isItAdmin(makeUser('admin'))).toBe(false)
        expect(isTreasurer(makeUser('treasurer'))).toBe(true)
        expect(isTreasurer(makeUser('superadmin'))).toBe(true)
        expect(isAuditor(makeUser('auditor'))).toBe(true)
        // Superadmin does NOT imply auditor (four-eyes principle)
        expect(isAuditor(makeUser('superadmin'))).toBe(false)
        expect(canManageRoadmap(makeUser('superadmin'))).toBe(true)
        expect(canManageRoadmap(makeUser('admin'))).toBe(false)
    })

    it('handles multiple roles', () => {
        const adminItUser = makeUser('admin', ['admin', 'it_admin', 'treasurer'])
        expect(isAdmin(adminItUser)).toBe(true)
        expect(isItAdmin(adminItUser)).toBe(true)
        expect(isTreasurer(adminItUser)).toBe(true)
        expect(isSuperadmin(adminItUser)).toBe(false)
        expect(canManageRoadmap(adminItUser)).toBe(false)

        const clubRoleUser = makeUser('member', ['committee', 'zeugwart', 'auditor'])
        expect(isAdmin(clubRoleUser)).toBe(false)
        expect(isCommittee(clubRoleUser)).toBe(true)
        expect(isZeugwart(clubRoleUser)).toBe(true)
        expect(isAuditor(clubRoleUser)).toBe(true)
        expect(hasRole(clubRoleUser, 'member')).toBe(true)

        const superUser = makeUser('superadmin', ['superadmin'])
        expect(isAdmin(superUser)).toBe(true)
        expect(isItAdmin(superUser)).toBe(true)
        expect(isTreasurer(superUser)).toBe(true)
        expect(isCommittee(superUser)).toBe(true)
        expect(isZeugwart(superUser)).toBe(true)
        expect(isSuperadmin(superUser)).toBe(true)
        expect(canManageRoadmap(superUser)).toBe(true)
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
        const types = [{ id: 1, name: 'Test', icon: '⚠️', default_amount: 1.0, sort_order: 0, sound_key: null }]
        useAppStore.getState().setPenaltyTypes(types)
        expect(useAppStore.getState().penaltyTypes).toHaveLength(1)
    })

    it('setRegularMembers stores the list', () => {
        const members = [{ id: 1, name: 'Hans', nickname: null, is_guest: false, is_active: true, is_committee: false, avatar: null, deactivated_at: null }]
        useAppStore.getState().setRegularMembers(members)
        expect(useAppStore.getState().regularMembers).toHaveLength(1)
    })

    it('setGuestPenaltyCap stores the cap', () => {
        useAppStore.getState().setGuestPenaltyCap(5.0)
        expect(useAppStore.getState().guestPenaltyCap).toBe(5.0)
    })
})
