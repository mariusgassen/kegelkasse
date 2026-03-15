import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import type {GameTemplate, PenaltyType, RegularMember, User} from '../types'

interface AppState {
    user: User | null
    activeEveningId: number | null
    penaltyTypes: PenaltyType[]
    regularMembers: RegularMember[]
    gameTemplates: GameTemplate[]
    setUser: (u: User | null) => void
    setActiveEveningId: (id: number | null) => void
    setPenaltyTypes: (pt: PenaltyType[]) => void
    setRegularMembers: (rm: RegularMember[]) => void
    setGameTemplates: (gt: GameTemplate[]) => void
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            user: null,
            activeEveningId: null,
            penaltyTypes: [],
            regularMembers: [],
            gameTemplates: [],
            setUser: (user) => set({user}),
            setActiveEveningId: (activeEveningId) => set({activeEveningId}),
            setPenaltyTypes: (penaltyTypes) => set({penaltyTypes}),
            setRegularMembers: (regularMembers) => set({regularMembers}),
            setGameTemplates: (gameTemplates) => set({gameTemplates}),
        }),
        {
            name: 'kegelkasse-app',
            partialize: (s) => ({user: s.user, activeEveningId: s.activeEveningId}),
        }
    )
)

// Role helpers
export const isAdmin = (user: User | null) =>
    user?.role === 'admin' || user?.role === 'superadmin'
