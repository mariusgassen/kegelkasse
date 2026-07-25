import {describe, it, expect} from 'vitest'
import {
    project,
    segmentsFor,
    laneHalfWidthAt,
    VIEW_W,
    LANE_TOP,
    LANE_BOTTOM,
    FAR_SCALE,
    NEAR_SCALE,
    CAMERA_LIFT,
    PIN_HEIGHT,
} from '../bowlingRender'
import {LANE, PIN_SPACING} from '../bowlingGame'

describe('project', () => {
    it('maps lane centre to the horizontal centre at any depth', () => {
        expect(project(LANE.width / 2, 0).sx).toBeCloseTo(VIEW_W / 2, 5)
        expect(project(LANE.width / 2, LANE.height).sx).toBeCloseTo(VIEW_W / 2, 5)
    })

    it('puts the far end high and the near end low on screen', () => {
        expect(project(0, 0).sy).toBeCloseTo(LANE_TOP, 5)
        expect(project(0, LANE.height).sy).toBeCloseTo(LANE_BOTTOM, 5)
        expect(project(0, 0).sy).toBeLessThan(project(0, LANE.height).sy)
    })

    it('grows the sprite scale from far to near', () => {
        expect(project(0, 0).scale).toBeCloseTo(FAR_SCALE, 5)
        expect(project(0, LANE.height).scale).toBeCloseTo(NEAR_SCALE, 5)
        expect(project(0, 0).scale).toBeLessThan(project(0, LANE.height).scale)
    })

    it('makes the near end wider than the far end (perspective)', () => {
        const farSpan = project(LANE.width, 0).sx - project(0, 0).sx
        const nearSpan = project(LANE.width, LANE.height).sx - project(0, LANE.height).sx
        expect(nearSpan).toBeGreaterThan(farSpan)
    })

    it('keeps the sprite scale proportional to the lane width at the same depth', () => {
        // Isotropy: one lane unit across must be the same px as one lane unit of sprite height.
        for (const y of [0, LANE.height / 3, LANE.height]) {
            const span = project(LANE.width, y).sx - project(0, y).sx
            expect(project(0, y).scale).toBeCloseTo(span / LANE.width, 5)
        }
    })

    it('foreshortens depth toward the back, but keeps the far end readable', () => {
        // Equal steps in lane depth cover less screen height at the far end than at the near end.
        // The lifted camera bounds how extreme that gets: at eye level the rack rows would collapse
        // to a few px apart, far less than the height of the pins standing on them.
        const step = LANE.height / 10
        const farRun = project(0, step).sy - project(0, 0).sy
        const nearRun = project(0, LANE.height).sy - project(0, LANE.height - step).sy
        expect(farRun).toBeGreaterThan(0)
        expect(nearRun).toBeGreaterThan(farRun * 1.5)
        expect(nearRun).toBeLessThan(farRun * 5)
    })

    it('keeps a whole rack row-pitch comparable to the height of a pin standing on it', () => {
        // Readability guard for the far end: if a row of pins is drawn much taller than the gap to
        // the next row, the diamond renders as one unreadable clump.
        const rowPitch = project(0, PIN_SPACING / 2).sy - project(0, 0).sy
        const pinHeight = PIN_HEIGHT * project(0, 0).scale
        expect(pinHeight / rowPitch).toBeLessThan(1.5)
    })

    it('lifts the camera without going fully top-down', () => {
        expect(CAMERA_LIFT).toBeGreaterThan(0)
        expect(CAMERA_LIFT).toBeLessThan(1)
    })

    it('laneHalfWidthAt clamps and grows with depth', () => {
        expect(laneHalfWidthAt(0)).toBeLessThan(laneHalfWidthAt(1))
        expect(laneHalfWidthAt(-1)).toBe(laneHalfWidthAt(0))
        expect(laneHalfWidthAt(2)).toBe(laneHalfWidthAt(1))
    })
})

describe('segmentsFor', () => {
    it('lights all seven segments for 8', () => {
        expect(segmentsFor('8')).toEqual([true, true, true, true, true, true, true])
    })

    it('lights only b and c for 1', () => {
        expect(segmentsFor('1')).toEqual([false, true, true, false, false, false, false])
    })

    it('blanks an unknown character', () => {
        expect(segmentsFor('X')).toEqual([false, false, false, false, false, false, false])
    })

    it('every digit 0-9 has a pattern with at least two lit segments', () => {
        for (let d = 0; d <= 9; d++) {
            expect(segmentsFor(String(d)).filter(Boolean).length).toBeGreaterThanOrEqual(2)
        }
    })
})
