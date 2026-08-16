/**
 * Tests for SoundPickerButton component.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

const previewSound = vi.fn()
vi.mock('@/lib/soundboard', async () => {
    const actual = await vi.importActual<typeof import('@/lib/soundboard')>('@/lib/soundboard')
    return {...actual, previewSound}
})

async function renderButton(props: { value?: string | null; onChange?: (v: string | null) => void }) {
    const {SoundPickerButton} = await import('../SoundPickerButton')
    return render(
        <SoundPickerButton value={props.value ?? null} onChange={props.onChange ?? vi.fn()}/>,
    )
}

describe('SoundPickerButton', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders trigger button', async () => {
        await renderButton({})
        expect(screen.getAllByRole('button')[0]).toBeInTheDocument()
    })

    it('shows the current preset emoji on the trigger', async () => {
        await renderButton({value: 'buzzer'})
        expect(screen.getAllByRole('button')[0].textContent).toContain('🚨')
    })

    it('picker is not visible before clicking trigger', async () => {
        await renderButton({})
        expect(screen.queryByText('sound.none')).not.toBeInTheDocument()
    })

    it('opens picker when trigger is clicked, listing every preset plus "no sound"', async () => {
        await renderButton({})
        fireEvent.click(screen.getAllByRole('button')[0])
        expect(screen.getByText('sound.none')).toBeInTheDocument()
        expect(screen.getByText('sound.preset.buzzer')).toBeInTheDocument()
        expect(screen.getByText('sound.preset.laser')).toBeInTheDocument()
    })

    it('calls onChange with the picked preset key', async () => {
        const onChange = vi.fn()
        await renderButton({onChange})
        fireEvent.click(screen.getAllByRole('button')[0])
        fireEvent.click(screen.getByText('sound.preset.bell'))
        expect(onChange).toHaveBeenCalledWith('bell')
    })

    it('calls onChange with null when "no sound" is picked', async () => {
        const onChange = vi.fn()
        await renderButton({value: 'bell', onChange})
        fireEvent.click(screen.getAllByRole('button')[0])
        fireEvent.click(screen.getByText('sound.none'))
        expect(onChange).toHaveBeenCalledWith(null)
    })

    it('closes the picker after a pick', async () => {
        await renderButton({})
        fireEvent.click(screen.getAllByRole('button')[0])
        fireEvent.click(screen.getByText('sound.preset.bell'))
        expect(screen.queryByText('sound.none')).not.toBeInTheDocument()
    })

    it('previews a preset without closing or changing the value', async () => {
        const onChange = vi.fn()
        await renderButton({onChange})
        fireEvent.click(screen.getAllByRole('button')[0])
        fireEvent.click(screen.getAllByLabelText('sound.preview')[0])
        expect(previewSound).toHaveBeenCalled()
        expect(onChange).not.toHaveBeenCalled()
        expect(screen.getByText('sound.none')).toBeInTheDocument()
    })

    it('closes picker on outside mousedown', async () => {
        await renderButton({})
        fireEvent.click(screen.getAllByRole('button')[0])
        expect(screen.getByText('sound.none')).toBeInTheDocument()
        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('sound.none')).not.toBeInTheDocument()
    })
})
