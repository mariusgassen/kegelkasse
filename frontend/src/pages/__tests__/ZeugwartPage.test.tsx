import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

const storeState: any = {user: null, regularMembers: []}
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel(storeState)),
    isAdmin: vi.fn((u: any) => u?.role === 'admin'),
}))
vi.mock('@/hooks/useOnline.ts', () => ({useOnline: () => true}))
vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/components/ui/EmojiPickerButton.tsx', () => ({EmojiPickerButton: () => <span/>}))

vi.mock('@/api/client.ts', () => ({
    api: {
        listInventory: vi.fn(),
        listZeugwarte: vi.fn(),
        listInventoryMovements: vi.fn(),
        createInventoryItem: vi.fn(),
        addInventoryMovement: vi.fn(),
        updateInventoryItem: vi.fn(),
        deleteInventoryItem: vi.fn(),
        setZeugwart: vi.fn(),
    },
}))

import {api} from '@/api/client.ts'
import {ZeugwartPage} from '../ZeugwartPage'

const STICKER = {id: 1, name: 'Sticker', icon: '🏷️', stock: 10, target: 50, missing: 40, note: 'rund', updated_at: null}
const SHIRT = {id: 2, name: 'Shirt', icon: '👕', stock: 20, target: 20, missing: 0, note: null, updated_at: null}
const MEMBERS = [
    {id: 1, name: 'Anna', nickname: null, is_active: true, is_guest: false, deactivated_at: null},
    {id: 3, name: 'Gast', nickname: null, is_active: true, is_guest: true, deactivated_at: null},
]

function renderPage() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><ZeugwartPage/></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    storeState.user = {id: 2, role: 'member'}
    storeState.regularMembers = MEMBERS
    vi.mocked(api.listInventory).mockResolvedValue({can_edit: false, items: [SHIRT, STICKER]})
    vi.mocked(api.listZeugwarte).mockResolvedValue([])
    vi.mocked(api.listInventoryMovements).mockResolvedValue([])
})

describe('ZeugwartPage', () => {
    it('lists items with the short ones first and shows what is missing', async () => {
        renderPage()
        const list = await screen.findByTestId('zeugwart-list')
        const names = Array.from(list.querySelectorAll('li')).map(li => li.textContent ?? '')
        expect(names[0]).toContain('Sticker')
        expect(names[0]).toContain('zeugwart.missing')
        expect(names[1]).toContain('Shirt')
        expect(names[1]).toContain('zeugwart.complete')
    })

    it('shows the empty state', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: false, items: []})
        renderPage()
        expect(await screen.findByText('zeugwart.empty')).toBeInTheDocument()
    })

    it('hides every edit control from plain members', async () => {
        renderPage()
        fireEvent.click(await screen.findByText('Sticker'))
        await screen.findByTestId('zeugwart-detail')
        expect(screen.queryByText('zeugwart.add')).not.toBeInTheDocument()
        expect(screen.queryByText(/zeugwart\.in$/)).not.toBeInTheDocument()
        expect(screen.queryByText('zeugwart.delete')).not.toBeInTheDocument()
        expect(screen.queryByTestId('zeugwart-manage')).not.toBeInTheDocument()
    })

    it('shows the history in the detail sheet', async () => {
        vi.mocked(api.listInventoryMovements).mockResolvedValue([
            {id: 9, delta: 5, stock_after: 10, note: 'Nachbestellt', actor_name: 'Zoe', created_at: '2026-01-02T10:00:00Z'},
        ])
        renderPage()
        fireEvent.click(await screen.findByText('Sticker'))
        expect(await screen.findByText('Nachbestellt')).toBeInTheDocument()
        expect(screen.getByText('+5')).toBeInTheDocument()
    })

    it('lets the keeper book stock in', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: true, items: [STICKER]})
        vi.mocked(api.addInventoryMovement).mockResolvedValue({...STICKER, stock: 15})
        renderPage()
        fireEvent.click(await screen.findByText('Sticker'))
        fireEvent.change(await screen.findByLabelText('zeugwart.amount'), {target: {value: '5'}})
        fireEvent.click(screen.getByText(/zeugwart\.in$/))
        await waitFor(() => expect(api.addInventoryMovement).toHaveBeenCalledWith(1, {delta: 5, note: undefined}))
    })

    it('books stock out as a negative delta', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: true, items: [STICKER]})
        vi.mocked(api.addInventoryMovement).mockResolvedValue({...STICKER, stock: 7})
        renderPage()
        fireEvent.click(await screen.findByText('Sticker'))
        fireEvent.change(await screen.findByLabelText('zeugwart.amount'), {target: {value: '3'}})
        fireEvent.click(screen.getByText(/zeugwart\.out$/))
        await waitFor(() => expect(api.addInventoryMovement).toHaveBeenCalledWith(1, {delta: -3, note: undefined}))
    })

    it('recounts to an absolute number', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: true, items: [STICKER]})
        vi.mocked(api.addInventoryMovement).mockResolvedValue({...STICKER, stock: 4})
        renderPage()
        fireEvent.click(await screen.findByText('Sticker'))
        fireEvent.click(await screen.findByText('zeugwart.recount'))
        fireEvent.change(screen.getByLabelText('zeugwart.recountTo'), {target: {value: '4'}})
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => expect(api.addInventoryMovement).toHaveBeenCalledWith(1, {count: 4, note: undefined}))
    })

    it('creates an item', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: true, items: []})
        vi.mocked(api.createInventoryItem).mockResolvedValue(STICKER)
        renderPage()
        fireEvent.click(await screen.findByText('+ zeugwart.add'))
        fireEvent.change(await screen.findByLabelText('zeugwart.name'), {target: {value: 'Nadel'}})
        fireEvent.change(screen.getByLabelText('zeugwart.stock'), {target: {value: '3'}})
        fireEvent.change(screen.getByLabelText('zeugwart.target'), {target: {value: '12'}})
        fireEvent.click(screen.getByText('action.save'))
        await waitFor(() => expect(api.createInventoryItem).toHaveBeenCalledWith(
            {name: 'Nadel', icon: '📦', stock: 3, target: 12, note: undefined}))
    })

    it('does not submit an item without a name', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: true, items: []})
        renderPage()
        fireEvent.click(await screen.findByText('+ zeugwart.add'))
        await screen.findByLabelText('zeugwart.name')
        expect(screen.getByText('action.save')).toBeDisabled()
    })

    it('confirms before deleting', async () => {
        vi.mocked(api.listInventory).mockResolvedValue({can_edit: true, items: [STICKER]})
        vi.mocked(api.deleteInventoryItem).mockResolvedValue(undefined as any)
        renderPage()
        fireEvent.click(await screen.findByText('Sticker'))
        fireEvent.click(await screen.findByText('zeugwart.delete'))
        expect(api.deleteInventoryItem).not.toHaveBeenCalled()
        fireEvent.click(await screen.findByText('action.delete'))
        await waitFor(() => expect(api.deleteInventoryItem).toHaveBeenCalledWith(1))
    })

    it('lets admins appoint a keeper, excluding guests', async () => {
        storeState.user = {id: 1, role: 'admin'}
        vi.mocked(api.setZeugwart).mockResolvedValue({id: 1, is_zeugwart: true})
        renderPage()
        const manage = await screen.findByTestId('zeugwart-manage')
        fireEvent.click(manage.querySelector('button')!)
        expect(screen.queryByText('Gast')).not.toBeInTheDocument()
        fireEvent.click(await screen.findByText('Anna'))
        await waitFor(() => expect(api.setZeugwart).toHaveBeenCalledWith(1, true))
    })

    it('names the current keepers', async () => {
        vi.mocked(api.listZeugwarte).mockResolvedValue([{id: 5, name: 'Zoe Z', nickname: 'Zoe'}])
        renderPage()
        expect(await screen.findByTestId('zeugwart-keepers')).toHaveTextContent('Zoe')
    })
})
