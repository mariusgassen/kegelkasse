import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {MarkdownField} from '../MarkdownField.tsx'

vi.mock('@/i18n', () => ({useT: () => (k: string) => k}))

describe('MarkdownField', () => {
    it('renders label, hint, textarea attributes and emits onChange', () => {
        const onChange = vi.fn()
        render(
            <MarkdownField
                id="note"
                label="Notiz"
                value="Hallo"
                onChange={onChange}
                rows={5}
                maxLength={500}
                placeholder="Schreib was"
            />
        )
        const textarea = screen.getByLabelText('Notiz') as HTMLTextAreaElement
        expect(textarea.tagName).toBe('TEXTAREA')
        expect(textarea).toHaveAttribute('rows', '5')
        expect(textarea).toHaveAttribute('maxLength', '500')
        expect(textarea).toHaveAttribute('placeholder', 'Schreib was')
        expect(textarea.value).toBe('Hallo')
        expect(screen.getByText('markdown.hint')).toBeInTheDocument()

        fireEvent.change(textarea, {target: {value: '**Neu**'}})
        expect(onChange).toHaveBeenCalledWith('**Neu**')
    })

    it('toggles between Write and Preview modes and renders formatted Markdown', () => {
        render(
            <MarkdownField
                id="desc"
                label="Beschreibung"
                value={'**Fett** und\n- Punkt'}
                onChange={vi.fn()}
            />
        )
        const writeTab = screen.getByTestId('desc-write-tab')
        const previewTab = screen.getByTestId('desc-preview-tab')
        expect(writeTab).toHaveAttribute('aria-pressed', 'true')
        expect(previewTab).toHaveAttribute('aria-pressed', 'false')

        fireEvent.click(previewTab)
        expect(previewTab).toHaveAttribute('aria-pressed', 'true')
        expect(screen.queryByLabelText('Beschreibung')).not.toBeInTheDocument()
        const preview = screen.getByTestId('desc-preview')
        expect(preview).toBeInTheDocument()
        expect(screen.getByText('Fett').tagName).toBe('STRONG')
        expect(screen.getByText('Punkt')).toBeInTheDocument()

        fireEvent.click(writeTab)
        expect(screen.getByLabelText('Beschreibung')).toBeInTheDocument()
    })

    it('shows dash placeholder in preview when value is blank', () => {
        render(<MarkdownField id="empty" label="Leer" value="   " onChange={vi.fn()}/>)
        fireEvent.click(screen.getByTestId('empty-preview-tab'))
        expect(screen.getByTestId('empty-preview')).toHaveTextContent('–')
    })
})
