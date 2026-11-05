import {create} from 'zustand'
import {persist} from 'zustand/middleware'

interface WhatsNewState {
    /** Newest release version the member has opened the sheet for; null = never. */
    lastSeen: string | null
    markSeen: (version: string) => void
}

export const useWhatsNewStore = create<WhatsNewState>()(
    persist(
        (set) => ({
            lastSeen: null,
            markSeen: (lastSeen) => set({lastSeen}),
        }),
        {name: 'kegelkasse-whatsnew'}
    )
)
