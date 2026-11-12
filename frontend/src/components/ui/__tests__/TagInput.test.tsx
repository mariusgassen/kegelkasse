import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {TagInput} from '../TagInput'

vi.mock('@/i18n', () => ({useT: () => (k: string) => k}))

describe('TagInput', () => {
    it('commits on Enter and comma, skips duplicates', () => {
        const onChange = vi.fn()
        render(<TagInput id="t" value={['a']} onChange={onChange}/>)
        const input = screen.getByRole('combobox')
        fireEvent.change(input, {target: {value: 'B'}})
        fireEvent.keyDown(input, {key: 'Enter'})
        expect(onChange).toHaveBeenLastCalledWith(['a', 'B'])
        fireEvent.change(input, {target: {value: 'A,'}})
        expect(onChange).toHaveBeenCalledTimes(1)
    })
    it('removes a pill', () => {
        const onChange = vi.fn()
        render(<TagInput value={['a', 'b']} onChange={onChange}/>)
        fireEvent.click(screen.getByLabelText('a – action.clear'))
        expect(onChange).toHaveBeenCalledWith(['b'])
    })
    it('replaces the value with max=1', () => {
        const onChange = vi.fn()
        render(<TagInput value={['feature']} max={1} onChange={onChange}/>)
        const input = screen.getByRole('combobox')
        fireEvent.change(input, {target: {value: 'design'}})
        fireEvent.keyDown(input, {key: 'Enter'})
        expect(onChange).toHaveBeenCalledWith(['design'])
    })
})
