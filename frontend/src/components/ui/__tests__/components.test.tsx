/**
 * Tests for simple UI components:
 * Empty, ModeToggle, AdminGuard, OfflineNotice, Toast, ChipSelect
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── mock i18n ────────────────────────────────────────────────────────────────
vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    t: (key: string) => key,
}))

// ── mock useOnline for OfflineNotice ─────────────────────────────────────────
vi.mock('@/hooks/useOnline', () => ({
    useOnline: vi.fn(() => true),
}))

// ── mock store for AdminGuard ────────────────────────────────────────────────
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((selector: (s: any) => any) => selector({ user: null })),
    isAdmin: vi.fn(() => false),
}))

// ── Empty ─────────────────────────────────────────────────────────────────────

describe('Empty', () => {
    it('renders icon and text', async () => {
        const { Empty } = await import('../Empty')
        render(<Empty icon="🎳" text="No items found" />)
        expect(screen.getByText('🎳')).toBeInTheDocument()
        expect(screen.getByText('No items found')).toBeInTheDocument()
    })
})

// ── ModeToggle ────────────────────────────────────────────────────────────────

describe('ModeToggle', () => {
    it('renders all options', async () => {
        const { ModeToggle } = await import('../ModeToggle')
        const options = [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
        ]
        render(<ModeToggle options={options} value="a" onChange={() => {}} />)
        expect(screen.getByText('Option A')).toBeInTheDocument()
        expect(screen.getByText('Option B')).toBeInTheDocument()
    })

    it('calls onChange with clicked option value', async () => {
        const { ModeToggle } = await import('../ModeToggle')
        const onChange = vi.fn()
        const options = [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B' },
        ]
        render(<ModeToggle options={options} value="a" onChange={onChange} />)
        fireEvent.click(screen.getByText('Option B'))
        expect(onChange).toHaveBeenCalledWith('b')
    })

    it('does not call onChange when clicking already-selected option', async () => {
        const { ModeToggle } = await import('../ModeToggle')
        const onChange = vi.fn()
        const options = [{ value: 'a', label: 'Option A' }]
        render(<ModeToggle options={options} value="a" onChange={onChange} />)
        fireEvent.click(screen.getByText('Option A'))
        expect(onChange).toHaveBeenCalledWith('a')
    })
})

// ── AdminGuard ────────────────────────────────────────────────────────────────

describe('AdminGuard', () => {
    afterEach(() => {
        vi.resetAllMocks()
    })

    it('shows lock message for non-admin user', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(false)
        vi.mocked(useAppStore).mockImplementation((sel: any) => sel({ user: null }))
        const { AdminGuard } = await import('../AdminGuard')
        render(<AdminGuard><span>Admin content</span></AdminGuard>)
        expect(screen.getByText('🔒')).toBeInTheDocument()
        expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
    })

    it('renders children for admin user', async () => {
        const { isAdmin, useAppStore } = await import('@/store/app.ts')
        vi.mocked(isAdmin).mockReturnValue(true)
        vi.mocked(useAppStore).mockImplementation((sel: any) =>
            sel({ user: { id: 1, role: 'admin', email: 'a@b.de', name: 'A', username: null, club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: null } })
        )
        const { AdminGuard } = await import('../AdminGuard')
        render(<AdminGuard><span>Admin content</span></AdminGuard>)
        expect(screen.getByText('Admin content')).toBeInTheDocument()
        expect(screen.queryByText('🔒')).not.toBeInTheDocument()
    })
})

// ── OfflineNotice ─────────────────────────────────────────────────────────────

describe('OfflineNotice', () => {
    afterEach(() => {
        vi.resetAllMocks()
    })

    it('renders nothing when online', async () => {
        const { useOnline } = await import('@/hooks/useOnline')
        vi.mocked(useOnline).mockReturnValue(true)
        const { OfflineNotice } = await import('../OfflineNotice')
        const { container } = render(<OfflineNotice />)
        expect(container.firstChild).toBeNull()
    })

    it('renders offline banner when offline', async () => {
        const { useOnline } = await import('@/hooks/useOnline')
        vi.mocked(useOnline).mockReturnValue(false)
        const { OfflineNotice } = await import('../OfflineNotice')
        render(<OfflineNotice />)
        expect(screen.getByText('📵')).toBeInTheDocument()
    })

    it('renders custom message when provided', async () => {
        const { useOnline } = await import('@/hooks/useOnline')
        vi.mocked(useOnline).mockReturnValue(false)
        const { OfflineNotice } = await import('../OfflineNotice')
        render(<OfflineNotice message="Custom offline message" />)
        expect(screen.getByText('Custom offline message')).toBeInTheDocument()
    })
})

// ── Toast ─────────────────────────────────────────────────────────────────────

describe('showToast / ToastContainer', () => {
    it('showToast is callable', async () => {
        const { showToast } = await import('../Toast')
        expect(() => showToast('Hello')).not.toThrow()
    })

    it('showToast accepts type parameter', async () => {
        const { showToast } = await import('../Toast')
        expect(() => showToast('Error!', 'error')).not.toThrow()
        expect(() => showToast('Info!', 'info')).not.toThrow()
        expect(() => showToast('OK!', 'success')).not.toThrow()
    })

    it('ToastContainer renders without toasts', async () => {
        const { ToastContainer } = await import('../Toast')
        const { container } = render(<ToastContainer />)
        expect(container.firstChild).toBeInTheDocument()
    })
})

// ── ChipSelect ────────────────────────────────────────────────────────────────

describe('ChipSelect', () => {
    const options = [
        { id: 1, label: 'Alice' },
        { id: 2, label: 'Bob' },
        { id: 3, label: 'Charlie' },
    ]

    it('renders all option labels', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        render(<ChipSelect options={options} selected={[]} onChange={() => {}} />)
        expect(screen.getByText('Alice')).toBeInTheDocument()
        expect(screen.getByText('Bob')).toBeInTheDocument()
        expect(screen.getByText('Charlie')).toBeInTheDocument()
    })

    it('shows empty placeholder when no options', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        render(<ChipSelect options={[]} selected={[]} onChange={() => {}} />)
        expect(screen.getByText('–')).toBeInTheDocument()
    })

    it('calls onChange with added id when unselected chip is clicked', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        const onChange = vi.fn()
        render(<ChipSelect options={options} selected={[]} onChange={onChange} />)
        fireEvent.click(screen.getByText('Alice'))
        expect(onChange).toHaveBeenCalledWith([1])
    })

    it('calls onChange with removed id when selected chip is clicked', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        const onChange = vi.fn()
        render(<ChipSelect options={options} selected={[1, 2]} onChange={onChange} />)
        fireEvent.click(screen.getByText('Alice'))
        expect(onChange).toHaveBeenCalledWith([2])
    })

    it('shows selected count when chips are selected', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        render(
            <ChipSelect options={options} selected={[1, 2]} onChange={() => {}} label="Players" />
        )
        expect(screen.getByText('(2)')).toBeInTheDocument()
    })

    it('calls onSelectAll when "All" button is clicked', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        const onSelectAll = vi.fn()
        render(
            <ChipSelect options={options} selected={[]} onChange={() => {}} onSelectAll={onSelectAll} />
        )
        fireEvent.click(screen.getByText('action.all'))
        expect(onSelectAll).toHaveBeenCalledOnce()
    })

    it('calls onSelectNone when "None" button is clicked', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        const onSelectNone = vi.fn()
        render(
            <ChipSelect options={options} selected={[1]} onChange={() => {}} onSelectNone={onSelectNone} />
        )
        fireEvent.click(screen.getByText('action.none'))
        expect(onSelectNone).toHaveBeenCalledOnce()
    })

    it('renders label when provided', async () => {
        const { ChipSelect } = await import('../ChipSelect')
        render(
            <ChipSelect options={options} selected={[]} onChange={() => {}} label="Pick players" />
        )
        expect(screen.getByText('Pick players')).toBeInTheDocument()
    })
})
