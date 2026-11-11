import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {Sticker} from '@/types.ts'

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key === 'stickers.count' ? 'stickers.count {n} {p}' : key,
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
vi.mock('@/lib/exifGps.ts', () => ({
    readFileExif: vi.fn(async () => ({gps: {latitude: 38.7, longitude: -9.1}, takenOn: '2024-08-15'})),
}))
vi.mock('@/lib/geocode.ts', () => ({reverseGeocode: vi.fn(async () => 'Lissabon, Portugal')}))
vi.mock('@/components/stickers/PhotoPicker.tsx', () => ({
    PhotoPicker: ({photos, onChange, onFiles, onSelect}: any) => (
        <div>
            <span data-testid="photo-count">{photos.length}</span>
            {photos.length === 0 && <span>stickers.form.photoRequired</span>}
            {photos.map((_: any, i: number) => (
                <button key={i} type="button" onClick={() => onSelect?.(i)}>select-photo-{i + 1}</button>
            ))}
            <button onClick={() => { onFiles?.([new File(['x'], 'a.jpg', {type: 'image/jpeg'})]); onChange([{url: '/uploads/media/media_1_a.jpg'}]) }}>
                upload-photo
            </button>
            <button onClick={() => onChange([
                {url: '/uploads/media/media_1_a.jpg', file: new File(['x'], 'a.jpg')},
                {url: '/uploads/media/media_1_b.jpg', file: new File(['y'], 'b.jpg')},
            ])}>upload-two</button>
        </div>
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
import {readFileExif} from '@/lib/exifGps.ts'
import {reverseGeocode} from '@/lib/geocode.ts'

const S = (over: Partial<Sticker> = {}): Sticker => ({
    id: 1, media_url: '/uploads/media/media_1_a.jpg', media_urls: ['/uploads/media/media_1_a.jpg'], place_name: 'Lisbon', latitude: 38.7, longitude: -9.1,
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

    it('only asks for the photo until one is chosen', async () => {
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        expect(screen.getByText('stickers.form.photoRequired')).toBeInTheDocument()
        expect(screen.queryByLabelText('stickers.form.place')).not.toBeInTheDocument()
        expect(screen.getByText('action.save')).toBeDisabled()
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => screen.getByLabelText('stickers.form.place'))
    })

    it('prefills place, pin and date from the photo and posts them', async () => {
        vi.mocked(api.createSticker).mockResolvedValue(S())
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => expect(screen.getByLabelText('stickers.form.place')).toHaveValue('Lissabon, Portugal'))
        expect(screen.getByLabelText('stickers.form.date')).toHaveValue('2024-08-15')
        expect(screen.getByText('stickers.form.fromPhoto')).toBeInTheDocument()
        // With a pin from the photo the map stays folded until the member wants to adjust it.
        expect(screen.queryByTestId('sticker-map')).not.toBeInTheDocument()
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(api.createSticker).toHaveBeenCalledWith(expect.objectContaining({
            media_urls: ['/uploads/media/media_1_a.jpg'], place_name: 'Lissabon, Portugal',
            latitude: 38.7, longitude: -9.1, stuck_on: '2024-08-15',
        })))
        // The list is reloaded after saving
        await waitFor(() => expect(vi.mocked(api.listStickers).mock.calls.length).toBeGreaterThan(1))
    })

    it('shows the map straight away when the photo has no position', async () => {
        vi.mocked(readFileExif).mockResolvedValueOnce({gps: null, takenOn: null})
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => screen.getByTestId('sticker-map'))
        expect(screen.getByLabelText('stickers.form.place')).toHaveValue('')
        expect(screen.getByText('action.save')).toBeDisabled() // no place, no pin
        fireEvent.click(screen.getByText('drop-pin'))
        // Dropping a pin looks the place up too, since the field is still empty.
        await waitFor(() => expect(screen.getByLabelText('stickers.form.place')).toHaveValue('Lissabon, Portugal'))
        expect(reverseGeocode).toHaveBeenCalledWith(10, 20, 'de')
        await waitFor(() => expect(screen.getByText('action.save')).not.toBeDisabled())
    })

    it('never overwrites a typed place or a chosen date with the photo data', async () => {
        vi.mocked(reverseGeocode).mockImplementationOnce(() => new Promise(r => setTimeout(() => r('Lissabon, Portugal'), 20)))
        vi.mocked(readFileExif).mockResolvedValueOnce({gps: null, takenOn: null})
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => screen.getByTestId('sticker-map'))
        fireEvent.click(screen.getByText('drop-pin')) // starts the slow lookup
        fireEvent.change(screen.getByLabelText('stickers.form.place'), {target: {value: 'Porto'}})
        fireEvent.change(screen.getByLabelText('stickers.form.date'), {target: {value: '2020-01-01'}})
        await new Promise(r => setTimeout(r, 40))
        expect(screen.getByLabelText('stickers.form.place')).toHaveValue('Porto')
        expect(screen.getByLabelText('stickers.form.date')).toHaveValue('2020-01-01')
    })

    it('lets the member adjust the pin on the map afterwards, and a dropped pin wins', async () => {
        vi.mocked(api.createSticker).mockResolvedValue(S())
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => screen.getByText('stickers.form.adjustPin'))
        fireEvent.click(screen.getByText('stickers.form.adjustPin'))
        expect(screen.getByTestId('sticker-map').dataset.picked).toBe('38.7')
        fireEvent.click(screen.getByText('drop-pin'))
        await waitFor(() => expect(screen.getByTestId('sticker-map').dataset.picked).toBe('10'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(api.createSticker).toHaveBeenCalledWith(expect.objectContaining({latitude: 10, longitude: 20})))
    })

    it('starts an edit with all photos of the post', async () => {
        vi.mocked(api.listStickers).mockResolvedValue([S({media_urls: ['/a.jpg', '/b.jpg']})])
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('action.more'))
        fireEvent.click(await screen.findByText('action.edit'))
        expect(screen.getByTestId('photo-count')).toHaveTextContent('2')
    })

    it('numbers the photos of a post with several photos in the feed', async () => {
        vi.mocked(api.listStickers).mockResolvedValue([S({media_urls: ['/a.jpg', '/b.jpg', '/c.jpg']})])
        renderPage()
        await waitFor(() => screen.getByTestId('photo-gallery'))
        expect(screen.getByText('1/3')).toBeInTheDocument()
        expect(screen.getByText('3/3')).toBeInTheDocument()
    })

    it('offers one post or one post per photo only for several photos', async () => {
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => screen.getByLabelText('stickers.form.place'))
        expect(screen.queryByText('stickers.form.modeSplit')).not.toBeInTheDocument()
        fireEvent.click(screen.getByText('upload-two'))
        expect(screen.getByText('stickers.form.modeSplit')).toBeInTheDocument()
    })

    it('creates one post per photo, each from its own photo data', async () => {
        vi.mocked(api.createSticker).mockResolvedValue(S())
        vi.mocked(readFileExif).mockImplementation(async (f: File) => f.name === 'b.jpg'
            ? {gps: {latitude: 41.9, longitude: 12.5}, takenOn: null}
            : {gps: {latitude: 38.7, longitude: -9.1}, takenOn: '2024-08-15'})
        vi.mocked(reverseGeocode).mockImplementation(async (lat: number) => lat > 40 ? 'Rom, Italien' : 'Lissabon, Portugal')
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-photo'))
        await waitFor(() => screen.getByLabelText('stickers.form.place'))
        fireEvent.click(screen.getByText('upload-two'))
        fireEvent.click(screen.getByText('stickers.form.modeSplit'))
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(api.createSticker).toHaveBeenCalledTimes(2))
        vi.mocked(readFileExif).mockImplementation(async () => ({gps: {latitude: 38.7, longitude: -9.1}, takenOn: '2024-08-15'}))
        vi.mocked(reverseGeocode).mockImplementation(async () => 'Lissabon, Portugal')
        expect(api.createSticker).toHaveBeenNthCalledWith(1, expect.objectContaining({
            media_urls: ['/uploads/media/media_1_a.jpg'], place_name: 'Lissabon, Portugal', latitude: 38.7, stuck_on: '2024-08-15'}))
        expect(api.createSticker).toHaveBeenNthCalledWith(2, expect.objectContaining({
            media_urls: ['/uploads/media/media_1_b.jpg'], place_name: 'Rom, Italien', latitude: 41.9}))
    })

    it('shows the determined place and date per photo when stepping through pictures in split mode', async () => {
        vi.mocked(readFileExif).mockImplementation(async (f: File) => f.name === 'b.jpg'
            ? {gps: {latitude: 41.9, longitude: 12.5}, takenOn: '2024-09-01'}
            : {gps: {latitude: 38.7, longitude: -9.1}, takenOn: '2024-08-15'})
        vi.mocked(reverseGeocode).mockImplementation(async (lat: number) => lat > 40 ? 'Rom, Italien' : 'Lissabon, Portugal')
        renderPage()
        await waitFor(() => screen.getByText('Lisbon'))
        fireEvent.click(screen.getByLabelText('stickers.add'))
        fireEvent.click(screen.getByText('upload-two'))
        fireEvent.click(screen.getByText('stickers.form.modeSplit'))
        await waitFor(() => expect(screen.getByLabelText('stickers.form.place')).toHaveValue('Lissabon, Portugal'))
        expect(screen.getByLabelText('stickers.form.date')).toHaveValue('2024-08-15')

        fireEvent.click(screen.getByText('select-photo-2'))
        await waitFor(() => expect(screen.getByLabelText('stickers.form.place')).toHaveValue('Rom, Italien'))
        expect(screen.getByLabelText('stickers.form.date')).toHaveValue('2024-09-01')

        fireEvent.click(screen.getByText('select-photo-1'))
        expect(screen.getByLabelText('stickers.form.place')).toHaveValue('Lissabon, Portugal')

        vi.mocked(readFileExif).mockImplementation(async () => ({gps: {latitude: 38.7, longitude: -9.1}, takenOn: '2024-08-15'}))
        vi.mocked(reverseGeocode).mockImplementation(async () => 'Lissabon, Portugal')
    })

    it('filters feed and map by place, caption or poster and updates the count', async () => {
        const {useAppStore} = await import('@/store/app.ts')
        useAppStore.getState().setRegularMembers([
            {id: 1, name: 'Marius Gassen', nickname: 'Pudel', is_guest: false, is_active: true, is_committee: false, avatar: null, deactivated_at: null},
        ])
        vi.mocked(api.listStickers).mockResolvedValue([
            S({id: 1, place_name: 'Lisbon', latitude: 38.7, longitude: -9.1, created_by_name: 'Pudel'}),
            S({id: 2, place_name: 'Rome', latitude: 41.9, longitude: 12.5, caption: 'Colosseum', created_by_name: 'Hasi', can_edit: false}),
        ])
        renderPage()
        await waitFor(() => screen.getByText('Rome'))
        expect(screen.getByText('stickers.count 2 2')).toBeInTheDocument()

        fireEvent.click(screen.getByLabelText('stickers.search'))
        // Clicking a poster filter chip filters to that poster and updates the count
        fireEvent.click(screen.getByRole('button', {name: 'Hasi'}))
        expect(screen.queryByText('Lisbon')).not.toBeInTheDocument()
        expect(screen.getByText('Rome')).toBeInTheDocument()
        expect(screen.getByText('stickers.count 1 1')).toBeInTheDocument()

        // Searching by a member's real name also matches their Kegelname poster
        fireEvent.change(screen.getByPlaceholderText('stickers.search'), {target: {value: 'marius'}})
        expect(screen.getByText('Lisbon')).toBeInTheDocument()
        expect(screen.queryByText('Rome')).not.toBeInTheDocument()
        expect(screen.getByText('stickers.count 1 1')).toBeInTheDocument()

        fireEvent.change(screen.getByPlaceholderText('stickers.search'), {target: {value: 'zzz'}})
        expect(screen.getByText('stickers.search.empty')).toBeInTheDocument()
        expect(screen.getByText('stickers.count 0 0')).toBeInTheDocument()
        useAppStore.getState().setRegularMembers([])
    })

    it('scrolls the target sticker into view on deep link without cancelling the flash timer', async () => {
        const scrollSpy = vi.fn()
        Element.prototype.scrollIntoView = scrollSpy
        mockGetHashParams.mockReturnValue(new URLSearchParams('item=2'))
        renderPage()
        await waitFor(() => screen.getByText('Rome'))
        await waitFor(() => expect(scrollSpy).toHaveBeenCalled(), {timeout: 500})
        expect(document.getElementById('sticker-2')).toHaveClass('kce-deeplink-flash')
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
