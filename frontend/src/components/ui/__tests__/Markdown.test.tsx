import {describe, expect, it} from 'vitest'
import {render, screen} from '@testing-library/react'
import {Markdown} from '../Markdown.tsx'

describe('Markdown', () => {
    it('renders bold, italic, lists and headings', () => {
        render(<Markdown text={'## Titel\n\nEin **fetter** und *schräger* Text\n\n- eins\n- zwei\n\n1. a\n2. b'}/>)
        expect(screen.getByText('Titel')).toBeInTheDocument()
        expect(screen.getByText('fetter').tagName).toBe('STRONG')
        expect(screen.getByText('schräger').tagName).toBe('EM')
        expect(screen.getAllByRole('listitem')).toHaveLength(4)
    })
    it('never injects raw HTML', () => {
        const {container} = render(<Markdown text={'<img src=x onerror=alert(1)> hi'}/>)
        expect(container.querySelector('img')).toBeNull()
    })
})
