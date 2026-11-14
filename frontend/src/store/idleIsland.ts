import {create} from 'zustand'
import {persist} from 'zustand/middleware'

interface IdleIslandState {
    /** Hidden after explicit user dismiss (swipe or expanded close button). */
    dismissed: boolean
    /** Scheduled evening ID in window when dismissed, so a closer evening awakens it automatically. */
    dismissedScheduleId: number | null
    dismiss: (scheduleId?: number | null) => void
    awaken: () => void
}

export const useIdleIslandStore = create<IdleIslandState>()(
    persist(
        (set) => ({
            dismissed: false,
            dismissedScheduleId: null,
            dismiss: (scheduleId = null) => set({dismissed: true, dismissedScheduleId: scheduleId}),
            awaken: () => set({dismissed: false, dismissedScheduleId: null}),
        }),
        {name: 'kegelkasse-idle-island'},
    ),
)

/** Whether a non-idle island activity is on show (not persisted). The idle island yields to it. */
export const useIslandBusyStore = create<{busy: boolean; setBusy: (busy: boolean) => void}>()((set) => ({
    busy: false,
    setBusy: (busy) => set({busy}),
}))
