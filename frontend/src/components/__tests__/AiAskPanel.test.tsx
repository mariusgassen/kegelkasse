import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/api/client.ts', () => ({api: {getAiStatus: vi.fn(), aiAsk: vi.fn()}}))
vi.mock('@/hooks/useOnline.ts', () => ({useOnline: () => true}))
vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
const follow = vi.fn((_link: unknown) => true)
vi.mock('@/lib/aiLinks.ts', () => ({followAiLink: (l: unknown) => follow(l)}))

import {api} from '@/api/client.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {AiAskPanel} from '../ai/AiAskPanel'

const ANSWER = {
    answer: 'Geh zu [Kasse → Konten](app:treasury.accounts) oder lies [die Doku](docs:funktionen/kasse).',
    links: [
        {href: 'app:treasury.accounts', label: 'Kasse → Konten', kind: 'app', to: '/treasury', search: {tab: 'accounts'}},
        {href: 'docs:funktionen/kasse', label: 'die Doku', kind: 'docs', url: '/docs/funktionen/kasse'},
    ],
    sources: [{title: 'Kasse → Übersicht', url: '/docs/funktionen/kasse#übersicht'}],
}

function renderPanel(props: Partial<React.ComponentProps<typeof AiAskPanel>> = {}) {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const onNavigate = vi.fn()
    const r = render(<QueryClientProvider client={qc}>
        <AiAskPanel question="Wer schuldet?" onNavigate={onNavigate} {...props}/>
    </QueryClientProvider>)
    return {...r, onNavigate}
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getAiStatus).mockResolvedValue({enabled: true, search: true})
    vi.mocked(api.aiAsk).mockResolvedValue(ANSWER as never)
})

describe('AiAskPanel', () => {
    it('stays hidden when the club switched AI search off', async () => {
        vi.mocked(api.getAiStatus).mockResolvedValue({enabled: true, search: false})
        renderPanel()
        await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled())
        expect(screen.queryByTestId('ai-ask')).toBeNull()
    })

    it('asks and renders the answer with clickable links', async () => {
        const {onNavigate} = renderPanel()
        fireEvent.click(await screen.findByTestId('ai-ask-button'))
        expect(api.aiAsk).toHaveBeenCalledWith('Wer schuldet?')
        fireEvent.click(await screen.findByRole('button', {name: /Kasse → Konten/}))
        expect(follow).toHaveBeenCalledWith(ANSWER.links[0])
        expect(onNavigate).toHaveBeenCalled()
        expect(screen.getByRole('link', {name: /Kasse → Übersicht/})).toHaveAttribute('href', '/docs/funktionen/kasse#übersicht')
        // Same question already answered → no second ask button.
        expect(screen.queryByTestId('ai-ask-button')).toBeNull()
    })

    it('does not close the sheet for docs links', async () => {
        follow.mockReturnValueOnce(false)
        const {onNavigate} = renderPanel()
        fireEvent.click(await screen.findByTestId('ai-ask-button'))
        fireEvent.click(await screen.findByRole('button', {name: /die Doku/}))
        expect(onNavigate).not.toHaveBeenCalled()
    })

    it('asks on the Enter signal from the search field', async () => {
        const {rerender} = renderPanel({askSignal: 0})
        await screen.findByTestId('ai-ask-button')
        rerender(<QueryClientProvider client={new QueryClient()}>
            <AiAskPanel question="Wer schuldet?" onNavigate={vi.fn()} askSignal={1}/>
        </QueryClientProvider>)
        await waitFor(() => expect(api.aiAsk).toHaveBeenCalledTimes(1))
    })

    it('ignores too-short questions and shows the rate-limit message', async () => {
        const {unmount} = renderPanel({question: 'ab'})
        await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled())
        expect(screen.queryByTestId('ai-ask-button')).toBeNull()
        unmount()
        vi.mocked(api.aiAsk).mockRejectedValue(new Error('ai_rate_limited'))
        renderPanel()
        fireEvent.click(await screen.findByTestId('ai-ask-button'))
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('ai.error.rateLimited', 'error'))
    })
})
