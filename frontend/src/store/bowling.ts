import {create} from 'zustand'
import {persist} from 'zustand/middleware'

/**
 * High score for the hidden mini bowling game (Easter egg). Persisted on-device only —
 * it's a bit of fun, not club data, so it never touches the backend.
 */
interface BowlingState {
    highScore: number
    /** Record a finished game's score; keeps it only if it beats the current best. */
    submitScore: (score: number) => void
}

export const useBowlingStore = create<BowlingState>()(
    persist(
        (set, get) => ({
            highScore: 0,
            submitScore: (score) => {
                if (score > get().highScore) set({highScore: score})
            },
        }),
        {name: 'kegelkasse-bowling'},
    ),
)
