import {create} from 'zustand'
import {persist} from 'zustand/middleware'

/**
 * On-device state for the hidden mini bowling game (Easter egg).
 *
 * The authoritative high-score list is now club-wide and lives on the backend
 * (`api.getBowlingLeaderboard` / `api.submitBowlingScore`). This store keeps only:
 *  - `discovered`: set once the player opens the game, so the profile can reveal the
 *    leaderboard section only to players who have actually found the Easter egg.
 *  - `personalBest`: a local best used as an offline fallback for the in-game display when
 *    the club leaderboard can't be reached.
 */
interface BowlingState {
    discovered: boolean
    markDiscovered: () => void
    personalBest: number
    submitLocal: (score: number) => void
}

export const useBowlingStore = create<BowlingState>()(
    persist(
        (set, get) => ({
            discovered: false,
            markDiscovered: () => {
                if (!get().discovered) set({discovered: true})
            },
            personalBest: 0,
            submitLocal: (score) => {
                if (score > get().personalBest) set({personalBest: score})
            },
        }),
        {name: 'kegelkasse-bowling'},
    ),
)
