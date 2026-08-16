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
 *
 * Persisted in localStorage, which is scoped to the *browser*, not the logged-in user — on a
 * shared family/club device, a different member logging in would otherwise inherit whatever the
 * previous member already discovered. `ownerUserId` tracks who last owned this state; `syncOwner`
 * (called from App.tsx whenever the authenticated user changes) resets `discovered`/`personalBest`
 * when a *different, known* user takes over the device. A `null` `ownerUserId` (a fresh install, or
 * state persisted before this field existed) just adopts the current user without wiping anything —
 * only an actual owner mismatch counts as "someone else's device".
 */
interface BowlingState {
    discovered: boolean
    markDiscovered: () => void
    personalBest: number
    submitLocal: (score: number) => void
    ownerUserId: number | null
    syncOwner: (userId: number | null) => void
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
            ownerUserId: null,
            syncOwner: (userId) => {
                if (userId == null) return
                const owner = get().ownerUserId
                if (owner === userId) return
                if (owner == null) {
                    set({ownerUserId: userId})
                    return
                }
                set({ownerUserId: userId, discovered: false, personalBest: 0})
            },
        }),
        {name: 'kegelkasse-bowling'},
    ),
)
