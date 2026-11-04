import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

const storeState: any = { user: null, regularMembers: [] }
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel(storeState)),
    isAdmin: vi.fn((u: any) => u?.role === 'admin'),
}))

vi.mock('@/hooks/useOnline.ts', () => ({ useOnline: () => true }))
vi.mock('@/hooks/useDeepLink.ts', () => ({ useDeepLinkVersion: () => 0 }))

const hashParams = { value: new URLSearchParams() }
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => hashParams.value,
    clearHashParams: vi.fn(),
}))

vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))

vi.mock('@/api/client.ts', () => ({
    api: {
        listTreasuryAudits: vi.fn(),
        listAuditors: vi.fn(),
        getTreasuryAudit: vi.fn(),
        previewTreasuryAudit: vi.fn(),
        createTreasuryAudit: vi.fn(),
        signTreasuryAudit: vi.fn(),
        withdrawTreasuryAuditSignature: vi.fn(),
        deleteTreasuryAudit: vi.fn(),
        setAuditor: vi.fn(),
    },
}))

const ADMIN = { id: 1, role: 'admin', regular_member_id: 1 }
const AUDITOR = { id: 2, role: 'member', regular_member_id: 2 }

const MEMBERS = [
    { id: 1, name: 'Anna', nickname: null, is_active: true, is_guest: false, deactivated_at: null },
    { id: 2, name: 'Bernd', nickname: 'Bernie', is_active: true, is_guest: false, deactivated_at: null },
    { id: 3, name: 'Gast', nickname: null, is_active: true, is_guest: true, deactivated_at: null },
]

const SUMMARY = {
    opening_cash: 30, deposits: 30, payouts: 5, expenses: 12.5, other_income: 8, closing_cash: 50.5,
    booking_count: 1, outstanding_total: 4, credit_total: 0,
}

function audit(overrides: Record<string, any> = {}) {
    return {
        id: 7, title: 'Prüfung 2026', period_start: '2026-01-01', period_end: '2026-06-30',
        created_at: null, created_by_name: 'Anna', status: 'open', signed_by_me: false, signatures: [],
        summary: { ...SUMMARY, edited_count: 0, cancelled_count: 0 },
        snapshot: {
            ...SUMMARY,
            bookings: [{ kind: 'payment', id: 1, date: '2026-02-01', amount: 30, label: 'Bernie', note: null, created_by: 'Anna' }],
            edited: [], cancelled: [],
            balances: [{ regular_member_id: 2, name: 'Bernd', nickname: 'Bernie', penalty_total: 4, payments_total: 0, balance: -4, is_guest: false }],
        },
        ...overrides,
    }
}

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

async function setup(user: any, list: Record<string, any> = {}, auditors = [{ id: 2, name: 'Bernd', nickname: 'Bernie' }]) {
    storeState.user = user
    storeState.regularMembers = MEMBERS
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.listTreasuryAudits).mockResolvedValue({ can_create: false, can_sign: false, audits: [], ...list } as any)
    vi.mocked(api.listAuditors).mockResolvedValue(auditors as any)
    vi.mocked(api.getTreasuryAudit).mockResolvedValue(audit() as any)
    vi.mocked(api.previewTreasuryAudit).mockResolvedValue({ ...SUMMARY, bookings: [], edited: [], cancelled: [], balances: [] } as any)
    const { TreasuryAudit } = await import('../treasury/TreasuryAudit')
    render(<TreasuryAudit />, { wrapper })
    return api
}

beforeEach(() => {
    vi.clearAllMocks()
    hashParams.value = new URLSearchParams()
})

describe('TreasuryAudit', () => {
    it('lists auditors and shows the empty state', async () => {
        await setup(AUDITOR)
        expect(await screen.findByText('audit.empty')).toBeInTheDocument()
        expect(within(screen.getByTestId('audit-auditors')).getByText('Bernie')).toBeInTheDocument()
        expect(screen.queryByTestId('audit-manage')).not.toBeInTheDocument()
        expect(screen.queryByTestId('audit-new')).not.toBeInTheDocument()
    })

    it('lets an admin appoint auditors (guests excluded)', async () => {
        const api = await setup(ADMIN, { can_create: true })
        fireEvent.click(await screen.findByText('🛠️ audit.manageAuditors'))
        const manage = screen.getByTestId('audit-manage')
        expect(within(manage).queryByText('Gast')).not.toBeInTheDocument()
        fireEvent.click(within(manage).getByText('Anna'))
        await waitFor(() => expect(api.setAuditor).toHaveBeenCalledWith(1, true))
        fireEvent.click(within(manage).getByText('Bernie'))
        await waitFor(() => expect(api.setAuditor).toHaveBeenCalledWith(2, false))
    })

    it('creates an audit with a preview of the period', async () => {
        const api = await setup(ADMIN, { can_create: true })
        vi.mocked(api.createTreasuryAudit).mockResolvedValue(audit() as any)
        fireEvent.click(await screen.findByTestId('audit-new'))
        expect(await screen.findByTestId('audit-preview')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('audit.titleLabel'), { target: { value: ' Halbjahr ' } })
        fireEvent.click(screen.getByText('audit.create'))
        await waitFor(() => expect(api.createTreasuryAudit).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Halbjahr' })))
    })

    it('blocks a reversed period', async () => {
        await setup(ADMIN, { can_create: true })
        fireEvent.click(await screen.findByTestId('audit-new'))
        fireEvent.change(screen.getByLabelText('audit.periodStart'), { target: { value: '2026-12-01' } })
        fireEvent.change(screen.getByLabelText('audit.periodEnd'), { target: { value: '2026-01-01' } })
        expect(screen.getByText('audit.invalidPeriod')).toBeInTheDocument()
        expect(screen.getByText('audit.create')).toBeDisabled()
    })

    it('opens an audit and lets an auditor approve it', async () => {
        const api = await setup(AUDITOR, { can_sign: true, audits: [audit()] })
        vi.mocked(api.signTreasuryAudit).mockResolvedValue(audit() as any)
        fireEvent.click(await screen.findByTestId('audit-row'))
        expect(await screen.findByTestId('audit-detail')).toBeInTheDocument()
        fireEvent.click(screen.getByText('✅ audit.approve'))
        fireEvent.click(screen.getByText('audit.submit'))
        await waitFor(() => expect(api.signTreasuryAudit).toHaveBeenCalledWith(7, { approved: true, note: undefined }))
    })

    it('requires a remark for an objection', async () => {
        const api = await setup(AUDITOR, { can_sign: true, audits: [audit()] })
        fireEvent.click(await screen.findByTestId('audit-row'))
        await screen.findByTestId('audit-detail')
        fireEvent.click(screen.getByText('⚠️ audit.object'))
        expect(screen.getByText('audit.submit')).toBeDisabled()
        fireEvent.change(screen.getByLabelText('audit.noteRequired'), { target: { value: 'Beleg fehlt' } })
        fireEvent.click(screen.getByText('audit.submit'))
        await waitFor(() => expect(api.signTreasuryAudit).toHaveBeenCalledWith(7, { approved: false, note: 'Beleg fehlt' }))
    })

    it('hides the sign form from non-auditors and offers withdraw after signing', async () => {
        const api = await setup(AUDITOR, { can_sign: true, audits: [audit()] })
        vi.mocked(api.getTreasuryAudit).mockResolvedValue(audit({
            signed_by_me: true, status: 'approved',
            signatures: [{ id: 1, signer_name: 'Bernie', approved: true, note: null, signed_at: '2026-07-01T10:00:00', is_me: true }],
        }) as any)
        fireEvent.click(await screen.findByTestId('audit-row'))
        await screen.findByTestId('audit-detail')
        expect(screen.queryByTestId('audit-sign-form')).not.toBeInTheDocument()
        fireEvent.click(screen.getByText('audit.withdraw'))
        await waitFor(() => expect(api.withdrawTreasuryAuditSignature).toHaveBeenCalledWith(7))
    })

    it('opens the audit named in the deep link', async () => {
        hashParams.value = new URLSearchParams('audit=7')
        const api = await setup(AUDITOR, { audits: [audit()] })
        expect(await screen.findByTestId('audit-detail')).toBeInTheDocument()
        expect(api.getTreasuryAudit).toHaveBeenCalledWith(7)
        expect(screen.queryByTestId('audit-sign-form')).not.toBeInTheDocument()
    })

    it('lets an admin delete an unsigned audit after confirmation', async () => {
        const api = await setup(ADMIN, { can_create: true, audits: [audit()] })
        fireEvent.click(await screen.findByTestId('audit-row'))
        await screen.findByTestId('audit-detail')
        fireEvent.click(screen.getByText('audit.delete'))
        fireEvent.click(await screen.findByText('action.delete'))
        await waitFor(() => expect(api.deleteTreasuryAudit).toHaveBeenCalledWith(7))
    })
})
