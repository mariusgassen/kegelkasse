import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import type {GameTemplate, PenaltyType, RegularMember, User, UserRole} from '../types'

interface AppState {
    user: User | null
    activeEveningId: number | null
    penaltyTypes: PenaltyType[]
    regularMembers: RegularMember[]
    gameTemplates: GameTemplate[]
    guestPenaltyCap: number | null
    setUser: (u: User | null) => void
    setActiveEveningId: (id: number | null) => void
    setPenaltyTypes: (pt: PenaltyType[]) => void
    setRegularMembers: (rm: RegularMember[]) => void
    setGameTemplates: (gt: GameTemplate[]) => void
    setGuestPenaltyCap: (cap: number | null) => void
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            user: null,
            activeEveningId: null,
            penaltyTypes: [],
            regularMembers: [],
            gameTemplates: [],
            guestPenaltyCap: null,
            setUser: (user) => set({user}),
            setActiveEveningId: (activeEveningId) => set({activeEveningId}),
            setPenaltyTypes: (penaltyTypes) => set({penaltyTypes}),
            setRegularMembers: (regularMembers) => set({regularMembers}),
            setGameTemplates: (gameTemplates) => set({gameTemplates}),
            setGuestPenaltyCap: (guestPenaltyCap) => set({guestPenaltyCap}),
        }),
        {
            name: 'kegelkasse-app',
            partialize: (s) => ({user: s.user, activeEveningId: s.activeEveningId}),
        }
    )
)

// Role helpers
export const getUserRoles = (user: User | null): UserRole[] => {
    if (!user) return []
    if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
        return user.roles
    }
    return user.role ? [user.role] : []
}

export const hasRole = (user: User | null, ...roles: UserRole[]): boolean => {
    if (!user) return false
    if (roles.includes('member')) return true
    const assigned = getUserRoles(user)
    if (roles.some((r) => assigned.includes(r))) return true
    if (assigned.includes('superadmin') && roles.some((r) => r !== 'auditor')) {
        return true
    }
    return false
}

export const isAdmin = (user: User | null) =>
    hasRole(user, 'admin')

export const isSuperadmin = (user: User | null) =>
    getUserRoles(user).includes('superadmin')

export const isItAdmin = (user: User | null) =>
    hasRole(user, 'it_admin')

export const isTreasurer = (user: User | null) =>
    hasRole(user, 'treasurer')

export const isAuditor = (user: User | null) =>
    getUserRoles(user).includes('auditor')

export const isCommittee = (user: User | null) =>
    hasRole(user, 'committee')

export const isZeugwart = (user: User | null) =>
    hasRole(user, 'zeugwart')

export const canManageRoadmap = (user: User | null) =>
    isSuperadmin(user)


