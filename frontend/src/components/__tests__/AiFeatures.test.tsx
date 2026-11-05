import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

vi.mock('@/api/client.ts', () => ({
    api: {
        getAiStatus: vi.fn(),
        aiRecapEvening: vi.fn(),
        aiRecapSeason: vi.fn(),
        aiSuggestPenaltyTypes: vi.fn(),
        aiSuggestNickname: vi.fn(),
        aiBookingReview: vi.fn(),
        createAnnouncement: vi.fn(),
    },
}))

vi.mock('@/hooks/useOnline.ts', () => ({useOnline: () => true}))
vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({open, title, children}: any) => open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}))

const storeState = {user: {id: 1, role: 'admin', regular_member_id: 5}, regularMembers: [] as any[]}
vi.mock('@/store/app.ts', () => ({
    useAppStore: (sel: (s: typeof storeState) => unknown) => sel(storeState),
    isAdmin: (u: {role: string} | null) => u?.role === 'admin',
}))

import {api} from '@/api/client.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {AiRecapButton} from '../ai/AiRecapButton'
import {NicknameSuggestions, PenaltySuggestions} from '../ai/AiSuggestions'
import {BookingReviewCard} from '../treasury/BookingReviewCard'
import {aiErrorKey} from '@/lib/aiErrors'

function wrap(ui: React.ReactElement) {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
    return {invalidate}
}

beforeEach(() => {
    vi.clearAllMocks()
    storeState.user = {id: 1, role: 'admin', regular_member_id: 5}
    vi.mocked(api.getAiStatus).mockResolvedValue({enabled: true})
})

describe('aiErrorKey', () => {
    it('maps server details to message keys', () => {
        expect(aiErrorKey(new Error('ai_rate_limited'))).toBe('ai.error.rateLimited')
        expect(aiErrorKey(new Error('ai_unavailable:refused'))).toBe('ai.error.unavailable')
        expect(aiErrorKey(new Error('ai_disabled'))).toBe('ai.error.unavailable')
        expect(aiErrorKey(new Error('Evening not found'))).toBeNull()
    })
})

describe('AiRecapButton', () => {
    it('renders nothing when AI is not configured', async () => {
        vi.mocked(api.getAiStatus).mockResolvedValue({enabled: false})
        wrap(<AiRecapButton target={{kind: 'evening', eveningId: 3}}/>)
        await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled())
        expect(screen.queryByTestId('ai-recap-button')).toBeNull()
    })

    it('generates an evening recap, lets it be edited and posts it', async () => {
        vi.mocked(api.aiRecapEvening).mockResolvedValue({title: '👑 Abend', text: 'Lustig'})
        vi.mocked(api.createAnnouncement).mockResolvedValue({} as any)
        const {invalidate} = wrap(<AiRecapButton target={{kind: 'evening', eveningId: 3}}/>)
        fireEvent.click(await screen.findByTestId('ai-recap-button'))
        expect(await screen.findByDisplayValue('👑 Abend')).toBeTruthy()
        expect(api.aiRecapEvening).toHaveBeenCalledWith(3)
        fireEvent.change(screen.getByLabelText('ai.recap.text'), {target: {value: 'Noch lustiger'}})
        fireEvent.click(screen.getByTestId('ai-recap-post'))
        await waitFor(() => expect(api.createAnnouncement).toHaveBeenCalledWith({title: '👑 Abend', text: 'Noch lustiger'}))
        expect(invalidate).toHaveBeenCalledWith({queryKey: ['committee-announcements']})
    })

    it('season recap uses the year; members without committee rights cannot post', async () => {
        storeState.user = {id: 2, role: 'member', regular_member_id: 9}
        vi.mocked(api.aiRecapSeason).mockResolvedValue({title: 'Saison', text: 'x'})
        wrap(<AiRecapButton target={{kind: 'season', year: 2026}}/>)
        fireEvent.click(await screen.findByTestId('ai-recap-button'))
        await screen.findByTestId('ai-recap-sheet')
        expect(api.aiRecapSeason).toHaveBeenCalledWith(2026)
        expect(screen.queryByTestId('ai-recap-post')).toBeNull()
    })

    it('shows a readable error when the AI is unavailable', async () => {
        vi.mocked(api.aiRecapEvening).mockRejectedValue(new Error('ai_unavailable:api_error'))
        wrap(<AiRecapButton target={{kind: 'evening', eveningId: 3}}/>)
        fireEvent.click(await screen.findByTestId('ai-recap-button'))
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('ai.error.unavailable', 'error'))
        expect(screen.queryByTestId('ai-recap-sheet')).toBeNull()
    })
})

describe('suggestions', () => {
    it('penalty suggestion prefills the form via onPick', async () => {
        const onPick = vi.fn()
        const sug = {icon: '📱', name: 'Handy', amount: 2, reason: 'oft frei eingetragen'}
        vi.mocked(api.aiSuggestPenaltyTypes).mockResolvedValue({suggestions: [sug]})
        wrap(<PenaltySuggestions onPick={onPick}/>)
        fireEvent.click(await screen.findByTestId('ai-penalty-suggest'))
        fireEvent.click(await screen.findByText('Handy'))
        expect(onPick).toHaveBeenCalledWith(sug)
    })

    it('nickname suggestion fills the field', async () => {
        const onPick = vi.fn()
        vi.mocked(api.aiSuggestNickname).mockResolvedValue({suggestions: [{nickname: 'Tinamite', reason: 'Wortspiel'}]})
        wrap(<NicknameSuggestions memberId={7} onPick={onPick}/>)
        fireEvent.click(await screen.findByText('ai.button.suggestNickname'))
        fireEvent.click(await screen.findByText('Tinamite'))
        expect(api.aiSuggestNickname).toHaveBeenCalledWith(7)
        expect(onPick).toHaveBeenCalledWith('Tinamite')
    })
})

describe('BookingReviewCard', () => {
    const review = {
        start: '2026-01-01', end: '2026-12-31', booking_count: 12, ai: true, summary: 'Eine Doppelbuchung.',
        flags: [{
            id: 0, kind: 'duplicate', severity: 'high', detail: {days_apart: 1}, ai_note: 'Beleg anfordern.',
            bookings: [
                {kind: 'payment', id: 1, date: '2026-05-10', amount: 25, label: 'Klausi', note: null},
                {kind: 'payment', id: 2, date: '2026-05-11', amount: 25, label: 'Klausi', note: null},
            ],
        }],
    }

    it('works without AI (rule-based only)', async () => {
        vi.mocked(api.getAiStatus).mockResolvedValue({enabled: false})
        vi.mocked(api.aiBookingReview).mockResolvedValue({...review, ai: false, summary: null, flags: []} as any)
        wrap(<BookingReviewCard/>)
        await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled())
        fireEvent.click(screen.getByText('ai.review.title'))
        fireEvent.click(screen.getByText('ai.review.run'))
        await screen.findByText('ai.review.clean')
        expect(vi.mocked(api.aiBookingReview).mock.calls[0][0]).toMatchObject({explain: false})
    })

    it('renders flags with the AI note and summary', async () => {
        vi.mocked(api.aiBookingReview).mockResolvedValue(review as any)
        wrap(<BookingReviewCard/>)
        await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled())
        fireEvent.click(screen.getByText('ai.review.title'))
        await waitFor(() => expect(screen.getByText(/ai.review.hintAi/)).toBeTruthy())
        fireEvent.click(screen.getByText('ai.review.run'))
        expect(await screen.findAllByTestId('booking-flag')).toHaveLength(1)
        expect(screen.getByText('ai.review.kind.duplicate')).toBeTruthy()
        expect(screen.getByText(/Beleg anfordern/)).toBeTruthy()
        expect(screen.getByTestId('booking-review-summary').textContent).toContain('Eine Doppelbuchung.')
        expect(vi.mocked(api.aiBookingReview).mock.calls[0][0]).toMatchObject({explain: true})
    })
})
