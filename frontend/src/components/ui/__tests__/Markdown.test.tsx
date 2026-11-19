import {describe, expect, it} from 'vitest'
import {render, screen} from '@testing-library/react'
import {InlineMarkdown, Markdown} from '../Markdown.tsx'

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
    it('shows links as plain labels unless the caller renders them', () => {
        const {container} = render(<Markdown text={'Geh zur [Kasse](app:treasury) oder [weg](https://evil.example)'}/>)
        expect(container.querySelector('a, button')).toBeNull()
        expect(screen.getByTestId('markdown').textContent).toBe('Geh zur Kasse oder weg')
    })
    it('renders links through renderLink, falling back to the label', () => {
        render(<Markdown text={'Zur [Kasse](app:treasury) und [Rest](app:x)'} renderLink={(label, href, key) =>
            href === 'app:treasury' ? <button key={key}>{label}</button> : null}/>)
        expect(screen.getByRole('button', {name: 'Kasse'})).toBeInTheDocument()
        expect(screen.queryByRole('button', {name: 'Rest'})).toBeNull()
        expect(screen.getByText(/Rest/)).toBeInTheDocument()
    })
})

describe('InlineMarkdown', () => {
    it('flattens headings, bullets and newlines while keeping inline styles', () => {
        render(<InlineMarkdown text={'## Überschrift\n\n**Wichtig** und *kurz* mit `code`\n- Punkt 1\n* Punkt 2'}/>)
        const el = screen.getByTestId('inline-markdown')
        expect(el.textContent).toBe('Überschrift Wichtig und kurz mit code • Punkt 1 • Punkt 2')
        expect(screen.getByText('Wichtig').tagName).toBe('STRONG')
        expect(screen.getByText('kurz').tagName).toBe('EM')
        expect(screen.getByText('code').tagName).toBe('CODE')
    })

    it('renders links as plain labels and never injects HTML', () => {
        const {container} = render(<InlineMarkdown text={'Siehe [Docs](https://evil.example) <script>x</script>'}/>)
        expect(container.querySelector('a, script')).toBeNull()
        expect(screen.getByTestId('inline-markdown').textContent).toBe('Siehe Docs <script>x</script>')
    })
})
