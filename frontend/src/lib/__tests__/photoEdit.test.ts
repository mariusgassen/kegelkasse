import {describe, expect, it} from 'vitest'
import {aspectRatio, cropRect, rotatedSize} from '../photoEdit'

describe('photoEdit', () => {
    it('uses the image shape for "original" and the preset otherwise', () => {
        expect(aspectRatio('original', 400, 200)).toBe(2)
        expect(aspectRatio('1:1', 400, 200)).toBe(1)
        expect(aspectRatio('16:9', 1, 1)).toBeCloseTo(16 / 9)
    })
    it('swaps the size for quarter turns only', () => {
        expect(rotatedSize(400, 200, 90)).toEqual({w: 200, h: 400})
        expect(rotatedSize(400, 200, 180)).toEqual({w: 400, h: 200})
    })
    it('keeps the whole frame for the original shape at zoom 1', () => {
        expect(cropRect(400, 200, 2, 1, 0, 0)).toEqual({sx: 0, sy: 0, sw: 400, sh: 200})
    })
    it('crops a square out of a landscape frame, centred', () => {
        expect(cropRect(400, 200, 1, 1, 0, 0)).toEqual({sx: 100, sy: 0, sw: 200, sh: 200})
    })
    it('pans to the edges and clamps beyond them', () => {
        expect(cropRect(400, 200, 1, 1, -1, 0).sx).toBe(0)
        expect(cropRect(400, 200, 1, 1, 1, 0).sx).toBe(200)
        expect(cropRect(400, 200, 1, 1, 5, 0).sx).toBe(200)
    })
    it('zooms into a smaller window and clamps the zoom', () => {
        const r = cropRect(400, 200, 2, 2, 0, 0)
        expect(r).toEqual({sx: 100, sy: 50, sw: 200, sh: 100})
        expect(cropRect(400, 200, 2, 99, 0, 0).sw).toBe(100)
        expect(cropRect(400, 200, 2, 0.1, 0, 0).sw).toBe(400)
    })
    it('never leaves the image', () => {
        for (const z of [1, 2, 4]) for (const p of [-1, 0, 1]) {
            const r = cropRect(300, 500, 16 / 9, z, p, p)
            expect(r.sx).toBeGreaterThanOrEqual(0)
            expect(r.sy).toBeGreaterThanOrEqual(0)
            expect(r.sx + r.sw).toBeLessThanOrEqual(300 + 1e-9)
            expect(r.sy + r.sh).toBeLessThanOrEqual(500 + 1e-9)
        }
    })
})
