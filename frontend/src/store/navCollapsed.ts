import {create} from 'zustand'
import {persist} from 'zustand/middleware'

interface NavCollapsedState {
    collapsed: boolean
    toggle: () => void
    setCollapsed: (collapsed: boolean) => void
}

// Desktop/tablet side-rail (#63) collapse state — only meaningful at the ≥lg breakpoint where
// the nav renders as a rail instead of a bottom bar. Persisted so the choice survives reloads.
export const useNavCollapsedStore = create<NavCollapsedState>()(
    persist(
        (set) => ({
            collapsed: false,
            toggle: () => set((s) => ({collapsed: !s.collapsed})),
            setCollapsed: (collapsed) => set({collapsed}),
        }),
        {name: 'kegelkasse-nav-collapsed'}
    )
)
