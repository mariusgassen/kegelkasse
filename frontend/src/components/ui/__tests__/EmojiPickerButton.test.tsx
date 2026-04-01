/**
 * Tests for EmojiPickerButton component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

// Mock emoji-picker-react — it's a heavy component and irrelevant to logic tests
vi.mock('emoji-picker-react', () => ({
    default: ({ onEmojiClick }: { onEmojiClick: (data: unknown) => void }) => (
        <div data-testid="emoji-picker">
            <button
                data-testid="emoji-option"
                onClick={() => onEmojiClick({ emoji: '🎉' })}
            >
                pick 🎉
            </button>
        </div>
    ),
    Theme: { DARK: 'dark' },
}))

// ── helpers ───────────────────────────────────────────────────────────────────

async function renderButton(props: {
    value?: string
    onChange?: (v: string) => void
    mode?: 'icon' | 'insert'
}) {
    const { EmojiPickerButton } = await import('../EmojiPickerButton')
    return render(
        <EmojiPickerButton
            value={props.value ?? ''}
            onChange={props.onChange ?? vi.fn()}
            mode={props.mode}
        />,
    )
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('EmojiPickerButton — icon mode (default)', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders trigger button', async () => {
        await renderButton({ value: '😀' })
        expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('shows current value in button', async () => {
        await renderButton({ value: '🏆' })
        expect(screen.getByRole('button').textContent).toContain('🏆')
    })

    it('shows fallback 😀 when value is empty', async () => {
        await renderButton({ value: '' })
        expect(screen.getByRole('button').textContent).toContain('😀')
    })

    it('picker is not visible before clicking trigger', async () => {
        await renderButton({ value: '😀' })
        expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
    })

    it('opens picker when trigger is clicked', async () => {
        await renderButton({ value: '😀' })
        fireEvent.click(screen.getByRole('button'))
        expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
    })

    it('calls onChange with selected emoji in icon mode', async () => {
        const onChange = vi.fn()
        await renderButton({ value: '😀', onChange })
        fireEvent.click(screen.getByRole('button'))
        fireEvent.click(screen.getByTestId('emoji-option'))
        expect(onChange).toHaveBeenCalledWith('🎉')
    })

    it('closes picker after emoji selection', async () => {
        await renderButton({ value: '😀' })
        fireEvent.click(screen.getByRole('button'))
        expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
        fireEvent.click(screen.getByTestId('emoji-option'))
        expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
    })

    it('closes picker on outside mousedown', async () => {
        await renderButton({ value: '😀' })
        fireEvent.click(screen.getByRole('button'))
        expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
        fireEvent.mouseDown(document.body)
        expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
    })

    it('closes picker on scroll outside', async () => {
        await renderButton({ value: '😀' })
        fireEvent.click(screen.getByRole('button'))
        expect(screen.getByTestId('emoji-picker')).toBeInTheDocument()
        fireEvent.scroll(document.body)
        expect(screen.queryByTestId('emoji-picker')).not.toBeInTheDocument()
    })
})

describe('EmojiPickerButton — insert mode', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders insert trigger button', async () => {
        await renderButton({ value: 'hello', mode: 'insert' })
        expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('appends emoji to existing value in insert mode', async () => {
        const onChange = vi.fn()
        await renderButton({ value: 'hello', onChange, mode: 'insert' })
        fireEvent.click(screen.getByRole('button'))
        fireEvent.click(screen.getByTestId('emoji-option'))
        expect(onChange).toHaveBeenCalledWith('hello🎉')
    })

    it('inserts emoji into empty string in insert mode', async () => {
        const onChange = vi.fn()
        await renderButton({ value: '', onChange, mode: 'insert' })
        fireEvent.click(screen.getByRole('button'))
        fireEvent.click(screen.getByTestId('emoji-option'))
        expect(onChange).toHaveBeenCalledWith('🎉')
    })
})
