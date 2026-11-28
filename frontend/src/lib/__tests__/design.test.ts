import {describe, expect, it} from 'vitest'
import {applyUiDesign, getUiDesign} from '../design'

describe('getUiDesign', () => {
    it.each([null, undefined, {}, {ui_design: 'classic' as const}])('is classic for %o', user => {
        expect(getUiDesign(user)).toBe('classic')
    })

    it('is new only when the member chose it', () => {
        expect(getUiDesign({ui_design: 'new'})).toBe('new')
    })
})

describe('applyUiDesign', () => {
    it('marks the element the new styles are scoped to', () => {
        const el = document.createElement('div')
        applyUiDesign('new', el)
        expect(el.dataset.design).toBe('new')
        applyUiDesign('classic', el)
        expect(el.dataset.design).toBe('classic')
    })
})
