export const QUICK_ENTRY_EVENT = 'kegelkasse:quick-entry-event'

export interface QuickEntryEventDetail {
    kind: 'penalty' | 'drink' | 'undo' | 'game'
    icon: string
    title: string
    subtitle: string
    badge?: string
    /** Offered as a button on the receipt (new design). */
    undo?: () => void
}

export function announceQuickEntryEvent(detail: QuickEntryEventDetail): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<QuickEntryEventDetail>(QUICK_ENTRY_EVENT, {detail}))
}

/** Sent by the island's start-game button while Schnellerfassung covers the shell. */
export const QUICK_ENTRY_GAME_ACTION_EVENT = 'kegelkasse:quick-entry-game-action'

export function requestQuickEntryGameAction(): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(QUICK_ENTRY_GAME_ACTION_EVENT))
}
