import {afterEach, describe, expect, it, vi} from 'vitest'
import {render} from '@testing-library/react'
import {useRef} from 'react'
import {useHeaderHeightVar} from '../useHeaderHeightVar'

function Probe() {
    const ref = useRef<HTMLDivElement>(null)
    useHeaderHeightVar(ref)
    return <div ref={ref} data-testid="h"/>
}

describe('useHeaderHeightVar', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('sets --app-header-h from the header height and removes it on unmount', () => {
        vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)
        const {unmount} = render(<Probe/>)
        expect(document.documentElement.style.getPropertyValue('--app-header-h')).toBe('96px')
        unmount()
        expect(document.documentElement.style.getPropertyValue('--app-header-h')).toBe('')
        vi.restoreAllMocks()
    })
})
