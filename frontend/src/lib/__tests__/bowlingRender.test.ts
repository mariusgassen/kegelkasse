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
} from '../bowlingRender'
import {LANE} from '../bowlingGame'

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
