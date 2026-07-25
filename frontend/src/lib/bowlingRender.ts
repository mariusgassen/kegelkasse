/**
 * Pure rendering math for the pseudo-3D bowling view — kept framework/canvas-free so it can be
 * unit-tested. The physics in `lib/bowlingGame` stays a flat top-down simulation; this module
 * projects a lane point (x across, y depth) into the 2.5D screen trapezoid and supplies the
 * 7-segment digit map for the VOLLMER-style scoreboard.
 *
 * Lane depth runs far→near: y = 0 is the back of the lane (where the pins stand, drawn small and
 * high on screen), y = LANE.height is the release point (drawn large and low). The far end is
 * narrow and the near end wide, so the lane reads as receding into the distance.
 */
import {LANE} from './bowlingGame'

/** Fixed canvas backing size the projection is defined against (CSS scales it to fit). */
export const VIEW_W = 360
export const VIEW_H = 620

/** Top band reserved for the machine/scoreboard; the lane is drawn below it. */
export const MACHINE_H = 150
export const LANE_TOP = MACHINE_H
export const LANE_BOTTOM = VIEW_H - 24

// Lane half-width (px) and sprite scale at the far and near ends.
export const FAR_HALF = 46
export const NEAR_HALF = 152
export const FAR_SCALE = 0.5
export const NEAR_SCALE = 1.3

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface Projected {
    sx: number
    sy: number
    scale: number
}

/** Project a lane point (x∈[0,LANE.width], y∈[0,LANE.height]) to screen px + a depth scale. */
export function project(x: number, y: number): Projected {
    const t = clamp01(y / LANE.height)
    const sy = lerp(LANE_TOP, LANE_BOTTOM, t)
    const half = lerp(FAR_HALF, NEAR_HALF, t)
    const sx = VIEW_W / 2 + (x / LANE.width - 0.5) * 2 * half
    const scale = lerp(FAR_SCALE, NEAR_SCALE, t)
    return {sx, sy, scale}
}

/** Half-width of the lane trapezoid at depth fraction t (0 far … 1 near). */
export function laneHalfWidthAt(t: number): number {
    return lerp(FAR_HALF, NEAR_HALF, clamp01(t))
}

// ── 7-segment display ──────────────────────────────────────────────────────────
// Segment order: [a, b, c, d, e, f, g]
//   a
// f   b
//   g
// e   c
//   d
const DIGIT_SEGMENTS: Record<string, boolean[]> = {
    '0': [true, true, true, true, true, true, false],
    '1': [false, true, true, false, false, false, false],
    '2': [true, true, false, true, true, false, true],
    '3': [true, true, true, true, false, false, true],
    '4': [false, true, true, false, false, true, true],
    '5': [true, false, true, true, false, true, true],
    '6': [true, false, true, true, true, true, true],
    '7': [true, true, true, false, false, false, false],
    '8': [true, true, true, true, true, true, true],
    '9': [true, true, true, true, false, true, true],
    ' ': [false, false, false, false, false, false, false],
    '-': [false, false, false, false, false, false, true],
}

/** Which of the 7 segments are lit for a single character (unknown → blank). */
export function segmentsFor(ch: string): boolean[] {
    return DIGIT_SEGMENTS[ch] ?? DIGIT_SEGMENTS[' ']
}
