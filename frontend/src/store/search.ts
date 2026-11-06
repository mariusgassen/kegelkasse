import {create} from 'zustand'
import type {AiAnswer} from '@/types.ts'

/**
 * Global-search state that must outlive the search sheet: following a result or an AI link closes
 * the sheet, and reopening it should bring back the query and the AI answer (a multi-step manual
 * is useless if it vanishes after the first click). Held in memory only — a reload starts fresh.
 */
interface SearchState {
    query: string
    answer: AiAnswer | null
    /** The question `answer` belongs to. */
    asked: string
    setQuery: (query: string) => void
    setAnswer: (answer: AiAnswer | null, asked: string) => void
    reset: () => void
}

export const useSearchStore = create<SearchState>()((set) => ({
    query: '',
    answer: null,
    asked: '',
    setQuery: (query) => set({query}),
    setAnswer: (answer, asked) => set({answer, asked}),
    reset: () => set({query: '', answer: null, asked: ''}),
}))
