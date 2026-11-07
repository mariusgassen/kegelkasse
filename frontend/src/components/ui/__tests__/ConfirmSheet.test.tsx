import {describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen} from '@testing-library/react'
import {ConfirmSheet} from '../ConfirmSheet'

vi.mock('@/i18n', () => ({useT: () => (k: string) => k}))

describe('ConfirmSheet', () => {
    it('shows the message and fires onConfirm', () => {
        const onConfirm = vi.fn()
        render(<ConfirmSheet open onClose={() => {}} title="T" message="Sure?" onConfirm={onConfirm}/>)
        expect(screen.getByText('Sure?')).toBeTruthy()
        fireEvent.click(screen.getByText('action.confirmDelete'))
        expect(onConfirm).toHaveBeenCalledOnce()
    })
    it('uses a custom label and disables the button while busy', () => {
        render(<ConfirmSheet open onClose={() => {}} title="T" message="m" confirmLabel="Go" busy onConfirm={() => {}}/>)
        expect((screen.getByText('Go') as HTMLButtonElement).disabled).toBe(true)
    })
})
