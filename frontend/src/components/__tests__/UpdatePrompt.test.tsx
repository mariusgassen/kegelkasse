import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {useI18n} from '@/i18n'

const swState = {
    needRefresh: false,
    applyUpdate: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(),
}

vi.mock('@/hooks/useSwUpdate', () => ({
    useSwUpdate: () => swState,
}))

import {UpdatePrompt} from '../UpdatePrompt'

beforeEach(() => {
    swState.needRefresh = false
    swState.applyUpdate.mockClear()
    swState.dismiss.mockClear()
    useI18n.setState({locale: 'de'})
})

describe('UpdatePrompt', () => {
    it('stays idle when no update is pending', () => {
        render(<UpdatePrompt/>)
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('announces an available update in the Dynamic Island and wires Update/Later actions', () => {
        swState.needRefresh = true
        render(<UpdatePrompt/>)
        expect(screen.getByRole('status').textContent).toContain('Eine neue Version ist verfügbar.')

        fireEvent.click(screen.getByRole('button', {name: 'Aktualisieren'}))
        expect(swState.applyUpdate).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByLabelText('Später'))
        expect(swState.dismiss).toHaveBeenCalledTimes(1)
    })
})
