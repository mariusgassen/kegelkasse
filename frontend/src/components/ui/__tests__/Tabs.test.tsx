import {describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen} from '@testing-library/react'
import {Tabs} from '../Tabs'

const items = [{id: 'a', label: 'Alpha'}, {id: 'b', label: 'Beta'}] as const

describe('Tabs', () => {
    it('highlights only the active tab', () => {
        render(<Tabs items={items} value="b" onChange={() => {}}/>)
        expect(screen.getByRole('button', {name: 'Beta'}).className).toContain('bg-accent')
        expect(screen.getByRole('button', {name: 'Alpha'}).className).not.toContain('bg-accent')
    })

    it('calls onChange with the tab id', () => {
        const onChange = vi.fn()
        render(<Tabs items={items} value="a" onChange={onChange}/>)
        fireEvent.click(screen.getByRole('button', {name: 'Beta'}))
        expect(onChange).toHaveBeenCalledWith('b')
    })
})
