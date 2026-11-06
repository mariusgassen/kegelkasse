import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, act} from '@testing-library/react'
import {useDocsViewer} from '@/store/docsViewer'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/components/ui/Sheet', () => ({
    Sheet: ({open, children}: any) => (open ? <div data-testid="sheet">{children}</div> : null),
}))

import {DocsViewer} from '../DocsViewer'

describe('DocsViewer', () => {
    beforeEach(() => useDocsViewer.getState().close())

    it('renders nothing until a docs url is opened', () => {
        render(<DocsViewer/>)
        expect(screen.queryByTestId('docs-frame')).not.toBeInTheDocument()
    })

    it('shows the docs page in a frame and removes it on close', () => {
        render(<DocsViewer/>)
        act(() => useDocsViewer.getState().open('/docs/funktionen/push'))
        expect(screen.getByTestId('docs-frame')).toHaveAttribute('src', '/docs/funktionen/push')
        act(() => useDocsViewer.getState().close())
        expect(screen.queryByTestId('docs-frame')).not.toBeInTheDocument()
    })
})
