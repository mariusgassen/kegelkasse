import {create} from 'zustand'
import {persist} from 'zustand/middleware'

interface EffectsState {
    effectsEnabled: boolean
    setEffectsEnabled: (v: boolean) => void
}

export const useEffectsStore = create<EffectsState>()(
    persist(
        (set) => ({
            effectsEnabled: true,
            setEffectsEnabled: (effectsEnabled) => set({effectsEnabled}),
        }),
        {name: 'kegelkasse-effects'}
    )
)
