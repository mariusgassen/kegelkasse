import {describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {ScoreEntry} from '../ScoreEntry'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

const ROWS = [{key: 'p:1', label: 'Bine'}, {key: 'p:2', label: 'Andi'}]
const submit = vi.fn()

function Harness({initial = {}}: { initial?: Record<string, string> }) {
    const [values, setValues] = useState<Record<string, string>>(initial)
    return (
        <form onSubmit={submit}>
            <ScoreEntry rows={ROWS} values={values} onChange={(k, v) => setValues(p => ({...p, [k]: v}))}/>
            <output data-testid="values">{JSON.stringify(values)}</output>
        </form>
    )
}

const press = (...keys: string[]) => keys.forEach(k => fireEvent.click(screen.getByRole('button', {name: k})))
const values = () => JSON.parse(screen.getByTestId('values').textContent!)

describe('ScoreEntry', () => {
    it('types into the first row and moves on with one key', () => {
        render(<Harness/>)
        press('1', '2', 'score.next', '7', 'score.next')
        expect(values()).toEqual({'p:1': '12', 'p:2': '7'})
        expect(screen.getByRole('button', {name: /Bine/})).toHaveAttribute('aria-pressed', 'true')
    })

    it('replaces an existing result on the first key and appends afterwards', () => {
        render(<Harness initial={{'p:1': '9'}}/>)
        press('4', '5')
        expect(values()['p:1']).toBe('45')
    })

    it('jumps to the row that is tapped', () => {
        render(<Harness/>)
        fireEvent.click(screen.getByRole('button', {name: /Andi/}))
        press('3')
        expect(values()).toEqual({'p:2': '3'})
    })

    it('handles decimals once and deleting', () => {
        render(<Harness/>)
        press(',', '1', ',', '5', ',')
        expect(values()['p:1']).toBe('1.5')
        press('score.erase')
        expect(values()['p:1']).toBe('1.')
    })

    it('stops at seven characters', () => {
        render(<Harness/>)
        press('1', '2', '3', '4', '5', '6', '7', '8')
        expect(values()['p:1']).toBe('1234567')
    })

    it('takes a physical keyboard without submitting the form around it', () => {
        render(<Harness/>)
        const pad = screen.getByRole('group', {name: 'game.scores'})
        for (const key of ['4', '2', 'Enter', '8', 'Backspace']) fireEvent.keyDown(pad, {key})
        expect(values()).toEqual({'p:1': '42', 'p:2': ''})
        expect(submit).not.toHaveBeenCalled()
    })

    it('renders nothing without anyone to score', () => {
        const {container} = render(<ScoreEntry rows={[]} values={{}} onChange={() => {}}/>)
        expect(container).toBeEmptyDOMElement()
    })
})
