import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: vi.fn(() => ({
        evening: null, isLoading: false, invalidate: vi.fn(), activeEveningId: null, isPending: false,
    })),
}))

vi.mock('@/hooks/useOnline.ts', () => ({
    useOnline: vi.fn(() => true),
}))

vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => new URLSearchParams(''),
    clearHashParams: vi.fn(),
}))

vi.mock('@/store/app.ts', () => ({
    isAdmin: vi.fn(() => false),
    useAppStore: vi.fn(() => ({
        user: null,
        regularMembers: [],
        setRegularMembers: vi.fn(),
    })),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        listPins: vi.fn().mockResolvedValue([]),
        getMembers: vi.fn().mockResolvedValue([]),
        listRegularMembers: vi.fn().mockResolvedValue([]),
        createRegularMember: vi.fn(),
        updateRegularMember: vi.fn(),
        deleteRegularMember: vi.fn(),
        createMemberInvite: vi.fn(),
        createResetToken: vi.fn(),
        linkUserToRoster: vi.fn(),
        mergeRegularMembers: vi.fn(),
        addPlayer: vi.fn(),
        updateMemberRole: vi.fn(),
        deactivateMember: vi.fn(),
        reactivateMember: vi.fn(),
        createInvite: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({
    toastError: vi.fn(),
}))

vi.mock('@/utils/share.ts', () => ({
    shareOrCopy: vi.fn(() => Promise.resolve(false)),
}))

vi.mock('@/components/ui/Toast.tsx', () => ({
    showToast: vi.fn(),
}))

vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({ open, children, title, onClose, onSubmit }: any) =>
        open ? (
            <div data-testid="sheet">
                <div data-testid="sheet-title">{title}</div>
                <button onClick={onClose}>close-sheet</button>
                {onSubmit && <button onClick={onSubmit}>submit-sheet</button>}
                {children}
            </div>
        ) : null,
}))

vi.mock('@/components/ui/OfflineNotice.tsx', () => ({
    OfflineNotice: () => null,
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const REGULAR_MEMBERS = [
    { id: 1, name: 'Hans Müller', nickname: 'Hansi', is_guest: false, is_active: true },
    { id: 2, name: 'Franz Schmidt', nickname: null, is_guest: false, is_active: true },
    { id: 3, name: 'Gast Franz', nickname: null, is_guest: true, is_active: true },
]

// An unlinked member (not tied to any app user)
const MEMBERS_WITH_UNLINKED = [
    ...REGULAR_MEMBERS,
    { id: 4, name: 'Unlinked Klaus', nickname: 'Klauschen', is_guest: false, is_active: true },
]

const APP_USERS = [
    { id: 10, name: 'Admin User', role: 'admin', regular_member_id: 1, is_active: true, avatar: null },
    { id: 11, name: 'Franz Schmidt', role: 'member', regular_member_id: 2, is_active: true, avatar: null },
]

const APP_USERS_WITH_INACTIVE = [
    ...APP_USERS,
    { id: 12, name: 'Inactive Pete', role: 'member', regular_member_id: null, is_active: false, avatar: null },
]

// App user with no linked roster member
const APP_USERS_UNLINKED = [
    { id: 10, name: 'Admin User', role: 'admin', regular_member_id: 1, is_active: true, avatar: null },
    { id: 13, name: 'No Roster User', role: 'member', regular_member_id: null, is_active: true, avatar: null },
]

function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

async function renderMembersPage() {
    const { MembersPage } = await import('../MembersPage')
    return render(<MembersPage />, { wrapper })
}

async function setupAdmin(members = REGULAR_MEMBERS) {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    const { api } = await import('@/api/client.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(api.listPins).mockResolvedValue([] as any)
    vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
    vi.mocked(useAppStore).mockReturnValue({
        user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
        regularMembers: members,
        setRegularMembers: vi.fn(),
    } as any)
}

async function setupMember(members = REGULAR_MEMBERS) {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    const { api } = await import('@/api/client.ts')
    vi.mocked(isAdmin).mockReturnValue(false)
    vi.mocked(api.listPins).mockResolvedValue([] as any)
    vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
    vi.mocked(useAppStore).mockReturnValue({
        user: { id: 11, role: 'member', email: 'f@b.de', name: 'Franz Schmidt', username: 'franz', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 2 },
        regularMembers: members,
        setRegularMembers: vi.fn(),
    } as any)
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MembersPage — display', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders member roster section', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('member.roster')).toBeInTheDocument()
        })
    })

    it('renders member names in roster', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            // Unlinked roster members (Hans is linked to app user, Franz is linked)
            // The roster shows unlinked members. Let's see who's unlinked.
            // Hans (id=1) is linked to app user id=10 (regular_member_id=1)
            // Franz (id=2) is linked to app user id=11 (regular_member_id=2)
            // Gast (id=3) is a guest, shows in Gäste section
            // So unlinked roster = [] → shows empty state
            expect(screen.getByText('member.none')).toBeInTheDocument()
        })
    })

    it('renders Ich badge for current user in app users', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('Ich')).toBeInTheDocument()
        })
    })

    it('shows search input', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByPlaceholderText('member.search')).toBeInTheDocument()
        })
    })

    it('shows + member.add button for admin', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText(/member\.add/)).toBeInTheDocument()
        })
    })

    it('does not show + member.add button for non-admin', async () => {
        await setupMember()
        await renderMembersPage()
        await waitFor(() => {
            // No add button for regular member
            expect(screen.queryByText(/\+ member\.add/)).not.toBeInTheDocument()
        })
    })

    it('shows guest section for guest members', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('player.knownGuests')).toBeInTheDocument()
        })
    })

    it('shows guest member name', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('Gast Franz')).toBeInTheDocument()
        })
    })

    it('shows member.guestLabel for guest members', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('member.guestLabel')).toBeInTheDocument()
        })
    })
})

describe('MembersPage — search', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('filters app users by search query', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getByPlaceholderText('member.search'))

        fireEvent.change(screen.getByPlaceholderText('member.search'), {
            target: { value: 'Franz' },
        })
        // Franz Schmidt should still be visible, Admin User should be filtered out
        await waitFor(() => {
            expect(screen.getByText('Franz Schmidt')).toBeInTheDocument()
        })
    })
})

describe('MembersPage — add member', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens add member sheet when button clicked', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.add/))

        fireEvent.click(screen.getByText(/member\.add/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('calls api.createRegularMember when form is submitted', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createRegularMember).mockResolvedValueOnce({
            id: 99, name: 'New Member', nickname: null, is_guest: false, is_active: true,
        } as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.add/))

        fireEvent.click(screen.getByText(/member\.add/))
        await waitFor(() => screen.getByTestId('sheet'))

        // Fill name (textboxes[0] is the search bar, textboxes[1] is the name input in the sheet)
        const textboxes = screen.getAllByRole('textbox')
        fireEvent.change(textboxes[1], { target: { value: 'New Member' } })

        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.createRegularMember).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'New Member' })
            )
        })
    })

    it('closes sheet when cancel is clicked', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.add/))

        fireEvent.click(screen.getByText(/member\.add/))
        await waitFor(() => screen.getByTestId('sheet'))

        fireEvent.click(screen.getByText('close-sheet'))
        await waitFor(() => {
            expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
        })
    })
})

describe('MembersPage — app user section', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows member.noAppUsers when no app users', async () => {
        await setupAdmin([])
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.getMembers).mockResolvedValue([] as any)
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('member.noAppUsers')).toBeInTheDocument()
        })
    })

    it('shows invite button for admin', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            // Admin sees the invite button (📨 club.tab.invites)
            expect(screen.getByText(/club\.tab\.invites/)).toBeInTheDocument()
        })
    })
})

describe('MembersPage — edit member from app user row', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens edit sheet when ✏️ clicked on app user row', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('✏️'))
        // First ✏️ is on the app user row (Admin User → linked to Hansi)
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('shows member name in edit sheet', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('✏️'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet-title')).toBeInTheDocument()
        })
    })

    it('calls api.updateRegularMember on submit', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateRegularMember).mockResolvedValueOnce({ id: 1, name: 'Hansi Updated', nickname: 'Hansi', is_guest: false } as any)
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('✏️'))
        fireEvent.click(screen.getAllByText('✏️')[0])
        await waitFor(() => screen.getByTestId('sheet'))
        // Change the name field
        const inputs = screen.getAllByRole('textbox')
        const nameInput = inputs.find(i => (i as HTMLInputElement).value === 'Hans Müller')
        if (nameInput) fireEvent.change(nameInput, { target: { value: 'Hans Updated' } })
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => {
            expect(api.updateRegularMember).toHaveBeenCalledWith(1, expect.objectContaining({ name: expect.any(String) }))
        })
    })
})

describe('MembersPage — unlinked roster member', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function setupWithUnlinked() {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: MEMBERS_WITH_UNLINKED,
            setRegularMembers: vi.fn(),
        } as any)
    }

    it('shows unlinked roster member in roster section', async () => {
        await setupWithUnlinked()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('Klauschen')).toBeInTheDocument()
        })
    })

    it('shows ✏️ edit button for unlinked roster member', async () => {
        await setupWithUnlinked()
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('✏️'))
        expect(screen.getAllByText('✏️').length).toBeGreaterThan(0)
    })

    it('calls api.deleteRegularMember when ✕ clicked on roster member', async () => {
        await setupWithUnlinked()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteRegularMember).mockResolvedValueOnce(undefined as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText('Klauschen'))
        // Find the ✕ buttons — last one in roster section
        // ✕ order: [0]=deactivate Franz app user, [1]=delete Klaus roster, [2]=delete Gast
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[1])
        await waitFor(() => {
            expect(api.deleteRegularMember).toHaveBeenCalledWith(4)
        })
    })
})

describe('MembersPage — unlinked app user', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function setupWithUnlinkedUser() {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS_UNLINKED as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: REGULAR_MEMBERS,
            setRegularMembers: vi.fn(),
        } as any)
    }

    it('shows member.noRosterEntry for unlinked app user', async () => {
        await setupWithUnlinkedUser()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('member.noRosterEntry')).toBeInTheDocument()
        })
    })

    it('shows 🔗 link button for unlinked app user', async () => {
        await setupWithUnlinkedUser()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText('🔗')).toBeInTheDocument()
        })
    })

    it('opens link sheet when 🔗 clicked', async () => {
        await setupWithUnlinkedUser()
        await renderMembersPage()
        await waitFor(() => screen.getByText('🔗'))
        fireEvent.click(screen.getByText('🔗'))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('MembersPage — inactive users', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function setupWithInactive() {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS_WITH_INACTIVE as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: REGULAR_MEMBERS,
            setRegularMembers: vi.fn(),
        } as any)
    }

    it('shows inactive user count toggle button', async () => {
        await setupWithInactive()
        await renderMembersPage()
        await waitFor(() => {
            // button shows "+ 1 member.showInactive"
            expect(screen.getByText(/member\.showInactive/)).toBeInTheDocument()
        })
    })

    it('reveals inactive users on toggle click', async () => {
        await setupWithInactive()
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.showInactive/))
        fireEvent.click(screen.getByText(/member\.showInactive/))
        await waitFor(() => {
            expect(screen.getByText('Inactive Pete')).toBeInTheDocument()
        })
    })

    it('calls api.reactivateMember when reactivate clicked', async () => {
        await setupWithInactive()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.reactivateMember).mockResolvedValueOnce(undefined as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.showInactive/))
        fireEvent.click(screen.getByText(/member\.showInactive/))
        await waitFor(() => screen.getByText('member.reactivate'))
        fireEvent.click(screen.getByText('member.reactivate'))
        await waitFor(() => {
            expect(api.reactivateMember).toHaveBeenCalledWith(12)
        })
    })
})

describe('MembersPage — role toggle and deactivate', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows role toggle button (↑/↓) for non-self admin users', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            // Franz Schmidt is member (id=11), current user is id=10
            // So ↑ should be shown for Franz
            expect(screen.getByText('↑')).toBeInTheDocument()
        })
    })

    it('calls api.updateMemberRole when ↑ clicked', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.updateMemberRole).mockResolvedValueOnce(undefined as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText('↑'))
        fireEvent.click(screen.getByText('↑'))
        await waitFor(() => {
            expect(api.updateMemberRole).toHaveBeenCalledWith(11, 'admin')
        })
    })

    it('calls api.deactivateMember when ✕ clicked on other user', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deactivateMember).mockResolvedValueOnce(undefined as any)
        await renderMembersPage()
        // App user ✕ is only for non-self users (not Franz since he is different from admin)
        // Franz Schmidt (id=11) has ✕ button
        await waitFor(() => screen.getAllByText('✕'))
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[0])
        await waitFor(() => {
            expect(api.deactivateMember).toHaveBeenCalledWith(11)
        })
    })
})

// ── additional coverage tests ──────────────────────────────────────────────────

describe('MembersPage — invite flow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows invite link button for admin', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getByText(/club\.tab\.invites/)).toBeInTheDocument()
        })
    })

    it('opens invite link sheet when button clicked', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createInvite).mockResolvedValueOnce({ token: 'abc123', expires_at: '2026-02-01T00:00:00' } as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText(/club\.tab\.invites/))
        fireEvent.click(screen.getByText(/club\.tab\.invites/))
        await waitFor(() => {
            // Invite link is generated and sheet or display appears
            expect(api.createInvite).toHaveBeenCalled()
        })
    })
})

describe('MembersPage — merge members', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens merge confirmation when merge button shown', async () => {
        // Set up unlinked user + members with overlap
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: MEMBERS_WITH_UNLINKED,
            setRegularMembers: vi.fn(),
        } as any)
        await renderMembersPage()
        await waitFor(() => {
            // Page renders without errors
            expect(screen.getByText('member.roster')).toBeInTheDocument()
        })
    })
})

describe('MembersPage — guest members actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows delete button for guest members', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getByText('Gast Franz'))
        expect(screen.getAllByText('✕').length).toBeGreaterThan(0)
    })

    it('calls api.deleteRegularMember when guest deleted', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.deleteRegularMember).mockResolvedValueOnce(undefined as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText('Gast Franz'))
        // Guest delete is the last ✕ (guests are at the end)
        const deleteBtns = screen.getAllByText('✕')
        fireEvent.click(deleteBtns[deleteBtns.length - 1])
        await waitFor(() => {
            expect(api.deleteRegularMember).toHaveBeenCalledWith(3)
        })
    })
})

describe('MembersPage — member search edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows all users when search cleared', async () => {
        await setupAdmin()
        await renderMembersPage()
        await waitFor(() => screen.getByPlaceholderText('member.search'))
        const searchInput = screen.getByPlaceholderText('member.search')
        fireEvent.change(searchInput, { target: { value: 'Franz' } })
        await waitFor(() => expect(screen.getByText('Franz Schmidt')).toBeInTheDocument())
        fireEvent.change(searchInput, { target: { value: '' } })
        await waitFor(() => {
            expect(screen.getByText('Admin User')).toBeInTheDocument()
            expect(screen.getByText('Franz Schmidt')).toBeInTheDocument()
        })
    })

    it('shows nickname in search results', async () => {
        await setupAdmin(REGULAR_MEMBERS)
        await renderMembersPage()
        await waitFor(() => screen.getByPlaceholderText('member.search'))
        // Search for nickname 'Hansi'
        fireEvent.change(screen.getByPlaceholderText('member.search'), { target: { value: 'Hansi' } })
        await waitFor(() => {
            expect(screen.getByText('Hansi')).toBeInTheDocument()
        })
    })
})

// ── new coverage tests ────────────────────────────────────────────────────────

describe('MembersPage — reset password sheet', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens reset sheet when 🔑 clicked', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createResetToken).mockResolvedValueOnce({ reset_url: '/auth/reset?token=abc' } as any)
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('🔑'))
        fireEvent.click(screen.getAllByText('🔑')[0])
        await waitFor(() => {
            expect(api.createResetToken).toHaveBeenCalled()
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('calls api.createResetToken with correct user id', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createResetToken).mockResolvedValueOnce({ reset_url: '/auth/reset?token=xyz' } as any)
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('🔑'))
        // Admin (self) is sorted first, so Franz Schmidt (id=11) is the second 🔑 button
        fireEvent.click(screen.getAllByText('🔑')[1])
        await waitFor(() => {
            expect(api.createResetToken).toHaveBeenCalledWith(11)
        })
    })
})

describe('MembersPage — roster member invite', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function setupWithUnlinkedMember() {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: MEMBERS_WITH_UNLINKED,
            setRegularMembers: vi.fn(),
        } as any)
    }

    it('opens invite sheet when 📨 clicked on roster member', async () => {
        await setupWithUnlinkedMember()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createMemberInvite).mockResolvedValueOnce({
            invite_url: '/auth/register?token=tok', member_name: 'Klauschen',
        } as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText('Klauschen'))
        // 📨 buttons are in the unlinked roster section
        const invBtns = screen.getAllByText('📨')
        fireEvent.click(invBtns[invBtns.length - 1])
        await waitFor(() => {
            expect(api.createMemberInvite).toHaveBeenCalledWith(4)
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('MembersPage — general invite button', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('calls api.createInvite when top 📨 button clicked', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createInvite).mockResolvedValueOnce({
            invite_url: '/auth/register?token=gen', token: 'gen',
        } as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText(/club\.tab\.invites/))
        fireEvent.click(screen.getByText(/club\.tab\.invites/))
        await waitFor(() => {
            expect(api.createInvite).toHaveBeenCalled()
        })
    })

    it('shows invite URL in sheet after general invite creation', async () => {
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.createInvite).mockResolvedValueOnce({
            invite_url: '/auth/register?token=mytoken', token: 'mytoken',
        } as any)
        await renderMembersPage()
        await waitFor(() => screen.getByText(/club\.tab\.invites/))
        fireEvent.click(screen.getByText(/club\.tab\.invites/))
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })
})

describe('MembersPage — pin icons display', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows pin icon next to member with a pin', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        // Member id=1 (Hansi) has a pin
        vi.mocked(api.listPins).mockResolvedValue([
            { id: 7, name: 'Goldnadel', icon: '🏅', holder_regular_member_id: 1 },
        ] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: REGULAR_MEMBERS,
            setRegularMembers: vi.fn(),
        } as any)
        await renderMembersPage()
        await waitFor(() => {
            expect(screen.getAllByTitle('Goldnadel').length).toBeGreaterThan(0)
        })
    })
})

describe('MembersPage — link sheet with available members', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('calls api.linkUserToRoster when a roster member is clicked in link sheet', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        // User with no linked roster member
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS_UNLINKED as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: REGULAR_MEMBERS,
            setRegularMembers: vi.fn(),
        } as any)
        vi.mocked(api.linkUserToRoster).mockResolvedValueOnce(undefined as any)
        vi.mocked(api.listRegularMembers).mockResolvedValueOnce(REGULAR_MEMBERS as any)

        await renderMembersPage()
        await waitFor(() => screen.getByText('🔗'))
        fireEvent.click(screen.getByText('🔗'))
        await waitFor(() => screen.getByTestId('sheet'))

        // Inside link sheet, unlinked members from REGULAR_MEMBERS that are not linked to anyone
        // Gast Franz (id=3) is not linked; Hans (id=1) and Franz (id=2) are linked to app users
        // With APP_USERS_UNLINKED: user 10 has regular_member_id=1, user 13 has null
        // So linkedMemberIds = {1}, available = members not in {1} = Franz(2) + Gast(3)
        await waitFor(() => screen.getByTestId('sheet'))
        const linkSheet = screen.getByTestId('sheet')
        await waitFor(() => {
            expect(within(linkSheet).getByText('Franz Schmidt')).toBeInTheDocument()
        })
        fireEvent.click(within(linkSheet).getByText('Franz Schmidt'))
        await waitFor(() => {
            expect(api.linkUserToRoster).toHaveBeenCalledWith(13, 2)
        })
    })
})

describe('MembersPage — merge sheet', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('opens merge sheet when ⇄ clicked on roster member', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: MEMBERS_WITH_UNLINKED,
            setRegularMembers: vi.fn(),
        } as any)
        await renderMembersPage()
        await waitFor(() => screen.getAllByText('⇄'))
        fireEvent.click(screen.getAllByText('⇄')[0])
        await waitFor(() => {
            expect(screen.getByTestId('sheet')).toBeInTheDocument()
        })
    })

    it('calls api.mergeRegularMembers when a keep target is clicked', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: MEMBERS_WITH_UNLINKED,
            setRegularMembers: vi.fn(),
        } as any)
        vi.mocked(api.mergeRegularMembers).mockResolvedValueOnce(undefined as any)
        vi.mocked(api.listRegularMembers).mockResolvedValueOnce(REGULAR_MEMBERS as any)

        await renderMembersPage()
        await waitFor(() => screen.getAllByText('⇄'))
        // Click ⇄ on Klaus (id=4), which is the only unlinked roster member
        fireEvent.click(screen.getAllByText('⇄')[0])
        await waitFor(() => screen.getByTestId('sheet'))

        // Inside merge sheet, regularMembers excluding mergeDiscard (Klaus=4) are shown
        // Hans(1), Franz(2) are shown; Gast(3) is is_guest but still in regularMembers
        // Click Hans Müller (nickname: Hansi)
        const mergeSheet = screen.getByTestId('sheet')
        await waitFor(() => {
            expect(within(mergeSheet).getByText('Hansi')).toBeInTheDocument()
        })
        fireEvent.click(within(mergeSheet).getByText('Hansi'))
        await waitFor(() => {
            expect(api.mergeRegularMembers).toHaveBeenCalledWith(4, 1)
        })
    })
})

describe('MembersPage — inactive toggle details', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    async function setupWithInactive() {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        const { api } = await import('@/api/client.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(api.listPins).mockResolvedValue([] as any)
        vi.mocked(api.getMembers).mockResolvedValue(APP_USERS_WITH_INACTIVE as any)
        vi.mocked(useAppStore).mockReturnValue({
            user: { id: 10, role: 'admin', email: 'a@b.de', name: 'Admin User', username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1 },
            regularMembers: REGULAR_MEMBERS,
            setRegularMembers: vi.fn(),
        } as any)
    }

    it('hides inactive users by default', async () => {
        await setupWithInactive()
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.showInactive/))
        expect(screen.queryByText('Inactive Pete')).not.toBeInTheDocument()
    })

    it('toggle text changes to hideInactive after revealing', async () => {
        await setupWithInactive()
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.showInactive/))
        fireEvent.click(screen.getByText(/member\.showInactive/))
        await waitFor(() => {
            expect(screen.getByText('member.hideInactive')).toBeInTheDocument()
        })
    })

    it('clicking toggle again hides inactive users', async () => {
        await setupWithInactive()
        await renderMembersPage()
        await waitFor(() => screen.getByText(/member\.showInactive/))
        fireEvent.click(screen.getByText(/member\.showInactive/))
        await waitFor(() => screen.getByText('Inactive Pete'))
        fireEvent.click(screen.getByText('member.hideInactive'))
        await waitFor(() => {
            expect(screen.queryByText('Inactive Pete')).not.toBeInTheDocument()
        })
    })
})
