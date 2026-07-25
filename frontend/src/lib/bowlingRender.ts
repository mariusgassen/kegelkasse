/**
 * Pure rendering math for the pseudo-3D bowling view — kept framework/canvas-free so it can be
 * unit-tested. The physics in `lib/bowlingGame` stays a flat top-down simulation; this module
 * projects a lane point (x across, y depth) into the 2.5D screen trapezoid and supplies the
 * 7-segment digit map for the VOLLMER-style scoreboard.
 *
 * Lane depth runs far→near: y = 0 is the back of the lane (where the pins stand, drawn small and
 * high on screen), y = LANE.height is the release point (drawn large and low).
 *
 * The mapping is a real perspective divide, not a linear ramp: a virtual camera sits behind the
 * near end and every quantity scales with 1/distance. That matters because it is what makes the
 * back of the lane foreshorten in *both* axes — with a linear depth ramp the rack stretched into a
 * tall narrow sliver instead of reading as a compact diamond sitting at the far end.
 */
import {LANE} from './bowlingGame'

/** Fixed canvas backing size the projection is defined against (CSS scales it to fit). */
export const VIEW_W = 360
export const VIEW_H = 620

/** Top band reserved for the machine/scoreboard; the lane is drawn below it. */
export const MACHINE_H = 150
export const LANE_TOP = MACHINE_H
export const LANE_BOTTOM = VIEW_H - 24

/** Lane half-width (px) at the far and near ends. */
export const FAR_HALF = 40
export const NEAR_HALF = 168

/**
 * Camera distance to the far end, in units of its distance to the near end. Implied by the two
 * half-widths, since apparent width is proportional to 1/distance.
 */
export const DEPTH_RATIO = NEAR_HALF / FAR_HALF
const U_FAR = 1 / DEPTH_RATIO
const U_NEAR = 1

/** Sprite scale in screen px per lane unit at each end (isotropic — same for widths and heights). */
export const NEAR_SCALE = (2 * NEAR_HALF) / LANE.width
export const FAR_SCALE = (2 * FAR_HALF) / LANE.width

/** Height of a pin sprite in lane units (visual only — physics treats a pin as a disc). */
export const PIN_HEIGHT = 26

/**
 * How far the camera is lifted above the lane, 0 = eye level … 1 = straight overhead.
 *
 * At eye level, ground depth foreshortens as 1/d² while sprite heights only shrink as 1/d, so at the
 * far end the rack rows end up a few px apart while the pins are ten times that tall — geometrically
 * honest (it is what you really see down a lane) but unreadable as a game, since the whole diamond
 * collapses into one clump of overlapping pins. Raising the camera spreads the rows back out. The
 * blend is applied to the screen row only; widths and sprite scale keep the true perspective divide.
 */
export const CAMERA_LIFT = 0.55

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Inverse camera distance (1/d) at depth fraction t (0 = far end, 1 = near end). */
function inverseDepth(t: number): number {
    const dist = DEPTH_RATIO - (DEPTH_RATIO - 1) * clamp01(t)
    return 1 / dist
}

/** Screen row fraction (0 = lane top, 1 = lane bottom) for depth fraction t. */
function screenRow(t: number): number {
    const perspective = (inverseDepth(t) - U_FAR) / (U_NEAR - U_FAR)
    return lerp(perspective, clamp01(t), CAMERA_LIFT)
}

export interface Projected {
    sx: number
    sy: number
    /** Screen px per lane unit at this depth — use it for every sprite dimension. */
    scale: number
}

/** Project a lane point (x∈[0,LANE.width], y∈[0,LANE.height]) to screen px + a depth scale. */
export function project(x: number, y: number): Projected {
    const t = y / LANE.height
    const u = inverseDepth(t)
    const sy = lerp(LANE_TOP, LANE_BOTTOM, screenRow(t))
    const half = NEAR_HALF * u
    const sx = VIEW_W / 2 + (x / LANE.width - 0.5) * 2 * half
    return {sx, sy, scale: NEAR_SCALE * u}
}

/** Half-width of the lane trapezoid at depth fraction t (0 far … 1 near). */
export function laneHalfWidthAt(t: number): number {
    return NEAR_HALF * inverseDepth(t)
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
