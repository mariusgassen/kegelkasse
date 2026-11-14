export const QUICK_ENTRY_EVENT = 'kegelkasse:quick-entry-event'

export interface QuickEntryEventDetail {
    kind: 'penalty' | 'drink' | 'undo' | 'game'
    icon: string
    title: string
    subtitle: string
    badge?: string
}

export function announceQuickEntryEvent(detail: QuickEntryEventDetail): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<QuickEntryEventDetail>(QUICK_ENTRY_EVENT, {detail}))
}
