import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {Sticker} from '@/types.ts'

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    useI18n: (sel: any) => sel({locale: 'de'}),
}))

let mockTab = 'feed'
const mockSetTab = vi.fn()
vi.mock('@/hooks/usePage.ts', () => ({
    useHashTab: () => [mockTab, mockSetTab],
}))
vi.mock('@/hooks/useOnline.ts', () => ({useOnline: () => mockOnline}))
let mockOnline = true

vi.mock('@/api/client.ts', () => ({
    api: {listStickers: vi.fn(), createSticker: vi.fn(), updateSticker: vi.fn(), deleteSticker: vi.fn()},
}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
const mockGetHashParams = vi.fn(() => new URLSearchParams(''))
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => mockGetHashParams(),
    clearHashParams: vi.fn(),
}))
vi.mock('@/components/ui/CommentThread.tsx', () => ({CommentThread: () => null}))
vi.mock('@/components/ui/ItemReactionBar.tsx', () => ({ItemReactionBar: () => null}))
vi.mock('@/components/ui/ZoomableImage.tsx', () => ({ZoomableImage: ({src}: any) => <img src={src} alt=""/>}))
vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/lib/exifGps.ts', () => ({readFileGps: vi.fn(async () => ({latitude: 38.7, longitude: -9.1}))}))
vi.mock('@/components/ui/MediaUploadButton.tsx', () => ({
    MediaUploadButton: ({onUploaded, onFile}: any) => (
        <button onClick={() => { onFile?.(new File(['x'], 'a.jpg', {type: 'image/jpeg'})); onUploaded('/uploads/media/media_1_a.jpg') }}>
            upload-photo
        </button>
    ),
}))
vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({open, children, title, onSubmit}: any) => open ? (
        <div data-testid="sheet"><div>{title}</div>{onSubmit && <button onClick={onSubmit}>submit-sheet</button>}{children}</div>
    ) : null,
}))
// Leaflet needs a real layout engine; the map itself is exercised by lib tests.
vi.mock('@/components/stickers/StickerMap.tsx', () => ({
    default: ({stickers, onOpen, onPick, picked}: any) => (
        <div data-testid="sticker-map" data-count={stickers?.length ?? 0} data-picked={picked ? `${picked.latitude}` : ''}>
            {onOpen && <button onClick={() => onOpen(stickers[0].id)}>pin</button>}
            {onPick && <button onClick={() => onPick({latitude: 10, longitude: 20})}>drop-pin</button>}
        </div>
    ),
}))

import {StickersPage} from '../StickersPage'
import {api} from '@/api/client.ts'

const S = (over: Partial<Sticker> = {}): Sticker => ({
    id: 1, media_url: '/uploads/media/media_1_a.jpg', place_name: 'Lisbon', latitude: 38.7, longitude: -9.1,
    caption: 'On a lamp post', stuck_on: '2025-07-01', created_by_name: 'Pudel', created_at: '2025-07-02T10:00:00Z',
    can_edit: true, ...over,
})

function renderPage() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><StickersPage/></QueryClientProvider>)
}

describe('StickersPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTab = 'feed'
        mockOnline = true
        mockGetHashParams.mockReturnValue(new URLSearchParams(''))
        vi.mocked(api.listStickers).mockResolvedValue([S(), S({id: 2, place_name: 'Rome', caption: 'Colosseum', can_edit: false})])
    })

    it('renders the feed with place, caption and author', async () => {
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        expect(screen.getByText('Rome')).toBeInTheDocument()
        expect(screen.getByText('On a lamp post')).toBeInTheDocument()
        expect(screen.getByText(/stickers.count/)).toBeInTheDocument()
    })

    it('shows the empty state', async () => {
        vi.mocked(api.listStickers).mockResolvedValue([])
        renderPage()
        await waitFor(() => screen.getByText('stickers.none'))
    })

    it('only offers edit/delete on own posts', async () => {
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        expect(screen.getAllByLabelText('action.more')).toHaveLength(1)
    })

    it('renders the map view with all stickers and opens a post from a pin', async () => {
        mockTab = 'map'
        renderPage()
        const map = await screen.findByTestId('sticker-map')
        expect(map.dataset.count).toBe('2')
        fireEvent.click(screen.getByText('pin'))
        expect(mockSetTab).toHaveBeenCalledWith('feed')
    })

    it('replaces the map by a hint when offline', async () => {
        mockTab = 'map'
        mockOnline = false
        renderPage()
        await waitFor(() => screen.getByText('stickers.map.offline'))
        expect(screen.queryByTestId('sticker-map')).not.toBeInTheDocument()
    })

    it('switches views via the toggle', async () => {
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByText('stickers.view.map'))
        expect(mockSetTab).toHaveBeenCalledWith('map')
    })

    it('posts a sticker with the pin taken from the photo', async () => {
        vi.mocked(api.createSticker).mockResolvedValue(S())
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByText(/stickers.add/))
        expect(screen.getByText('submit-sheet')).toBeInTheDocument()
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => expect(screen.getByTestId('sticker-map').dataset.picked).toBe('38.7'))
        fireEvent.change(screen.getByLabelText('stickers.form.place'), {target: {value: 'Porto'}})
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(api.createSticker).toHaveBeenCalledWith(expect.objectContaining({
            media_url: '/uploads/media/media_1_a.jpg', place_name: 'Porto', latitude: 38.7, longitude: -9.1,
        })))
        // The list is reloaded after saving
        await waitFor(() => expect(vi.mocked(api.listStickers).mock.calls.length).toBeGreaterThan(1))
    })

    it('keeps saving disabled until photo, place and pin are all set', async () => {
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByText(/stickers.add/))
        const save = () => screen.getByText('action.save')
        expect(save()).toBeDisabled()
        fireEvent.change(screen.getByLabelText('stickers.form.place'), {target: {value: 'X'}})
        expect(save()).toBeDisabled() // no photo, no pin
        fireEvent.click(screen.getByText('drop-pin'))
        await waitFor(() => expect(screen.getByTestId('sticker-map').dataset.picked).toBe('10'))
        expect(save()).toBeDisabled() // still no photo
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => expect(save()).not.toBeDisabled())
        // A manually dropped pin wins over the position read from the photo.
        expect(screen.getByTestId('sticker-map').dataset.picked).toBe('10')
    })

    it('edits an existing sticker', async () => {
        vi.mocked(api.updateSticker).mockResolvedValue(S())
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('action.more'))
        fireEvent.click(await screen.findByText('action.edit'))
        fireEvent.change(screen.getByLabelText('stickers.form.place'), {target: {value: 'Lisboa'}})
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(api.updateSticker).toHaveBeenCalledWith(1, expect.objectContaining({place_name: 'Lisboa'})))
    })

    it('deletes after confirmation', async () => {
        vi.mocked(api.deleteSticker).mockResolvedValue(undefined as any)
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('action.more'))
        fireEvent.click(await screen.findByText('action.delete'))
        await waitFor(() => screen.getByText('stickers.deleteConfirm'))
        expect(api.deleteSticker).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('action.confirmDelete'))
        await waitFor(() => expect(api.deleteSticker).toHaveBeenCalledWith(1))
    })
})
