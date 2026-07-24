/**
 * Pure, deterministic logic for the hidden mini 9-pin bowling game (Easter egg — 5 quick taps on
 * the app logo). Kept framework-free so it is fully unit-testable; the React component
 * (`components/BowlingGame.tsx`) only orchestrates input, the rAF loop and canvas rendering.
 *
 * Coordinate space is a fixed logical lane; the renderer scales it to the canvas. The lane runs
 * bottom→top: the ball launches from the bottom centre and rolls "up" (negative y) toward a
 * diamond rack of 9 pins — the classic German Kegeln arrangement (1-2-3-2-1).
 */

export const LANE = {width: 120, height: 200}
export const BALL_RADIUS = 6
export const PIN_RADIUS = 5
/** Displacement from a pin's origin, in lane units, beyond which it counts as knocked down. */
export const KNOCK_THRESHOLD = 8
/** Fastest launch speed (lane units / second) at full power. */
export const MAX_LAUNCH_SPEED = 320
/** Number of balls (rolls) per game. */
export const BALLS_PER_GAME = 3
/** Widest aim angle either side of straight-up, in radians (~35°). */
export const MAX_AIM_ANGLE = 0.6

const BALL_MASS = 3
const PIN_MASS = 1
const RESTITUTION = 0.55
const WALL_RESTITUTION = 0.6
// Per-second velocity decay (rolling friction). Applied as v *= (1 - DAMPING * dt).
const DAMPING = 0.7
// Below this speed an entity is treated as stopped.
const MIN_SPEED = 4

export interface Entity {
    x: number
    y: number
    vx: number
    vy: number
}

export interface Ball extends Entity {
    /** True once the ball has left the lane (rolled off the top / into the gutter). */
    gone: boolean
}

export interface Pin extends Entity {
    id: number
    /** Original resting position — displacement from it decides whether the pin is knocked. */
    ox: number
    oy: number
}

export interface World {
    ball: Ball
    pins: Pin[]
}

/** The 9-pin diamond rack (1-2-3-2-1), centred in the upper third of the lane. */
export function createRack(): Pin[] {
    const cx = LANE.width / 2
    const cy = 55
    const dx = 16
    const dy = 16
    // rowOffset (vertical, in units of dy) → count of pins in that row
    const rows: {row: number; count: number}[] = [
        {row: -2, count: 1},
        {row: -1, count: 2},
        {row: 0, count: 3},
        {row: 1, count: 2},
        {row: 2, count: 1},
    ]
    const pins: Pin[] = []
    let id = 0
    for (const {row, count} of rows) {
        const y = cy + row * dy
        // Centre the row horizontally: offsets are symmetric around 0.
        const startOffset = -((count - 1) / 2)
        for (let i = 0; i < count; i++) {
            const x = cx + (startOffset + i) * dx
            pins.push({id: id++, x, y, vx: 0, vy: 0, ox: x, oy: y})
        }
    }
    return pins
}

/** A fresh ball parked at the bottom-centre release point. */
export function createBall(): Ball {
    return {x: LANE.width / 2, y: LANE.height - 15, vx: 0, vy: 0, gone: false}
}

/**
 * Give the parked ball a launch velocity.
 * @param angle radians; 0 = straight up the lane, positive = toward the right wall.
 * @param power 0..1 fraction of {@link MAX_LAUNCH_SPEED}.
 */
export function launchBall(ball: Ball, angle: number, power: number): Ball {
    const speed = Math.max(0, Math.min(1, power)) * MAX_LAUNCH_SPEED
    return {
        ...ball,
        vx: Math.sin(angle) * speed,
        vy: -Math.cos(angle) * speed,
    }
}

function speedOf(e: Entity): number {
    return Math.hypot(e.vx, e.vy)
}

/** Displacement of a pin from its rest origin. */
export function pinDisplacement(pin: Pin): number {
    return Math.hypot(pin.x - pin.ox, pin.y - pin.oy)
}

/** A pin counts as knocked once it has been displaced past {@link KNOCK_THRESHOLD}. */
export function isKnocked(pin: Pin): boolean {
    return pinDisplacement(pin) > KNOCK_THRESHOLD
}

/** How many of the given pins are still standing. */
export function countStanding(pins: Pin[]): number {
    return pins.filter(p => !isKnocked(p)).length
}

/** Elastic-ish impulse resolution between two circles, mutating them in place. */
function collide(a: Entity, b: Entity, ra: number, rb: number, ma: number, mb: number): void {
    let dx = b.x - a.x
    let dy = b.y - a.y
    let dist = Math.hypot(dx, dy)
    const minDist = ra + rb
    if (dist >= minDist) return
    if (dist === 0) {
        // Perfectly overlapping — nudge apart along an arbitrary axis to get a valid normal.
        dx = 1
        dy = 0
        dist = 1
    }
    const nx = dx / dist
    const ny = dy / dist
    // Relative velocity along the collision normal.
    const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
    if (rvn < 0) {
        // Approaching — apply an impulse.
        const j = (-(1 + RESTITUTION) * rvn) / (1 / ma + 1 / mb)
        a.vx -= (j / ma) * nx
        a.vy -= (j / ma) * ny
        b.vx += (j / mb) * nx
        b.vy += (j / mb) * ny
    }
    // Positional correction so the circles no longer overlap (split by inverse mass).
    const overlap = minDist - dist
    const totalInvMass = 1 / ma + 1 / mb
    a.x -= nx * overlap * (1 / ma) / totalInvMass
    a.y -= ny * overlap * (1 / ma) / totalInvMass
    b.x += nx * overlap * (1 / mb) / totalInvMass
    b.y += ny * overlap * (1 / mb) / totalInvMass
}

function bounceWalls(e: Entity, r: number): void {
    if (e.x - r < 0) {
        e.x = r
        e.vx = Math.abs(e.vx) * WALL_RESTITUTION
    } else if (e.x + r > LANE.width) {
        e.x = LANE.width - r
        e.vx = -Math.abs(e.vx) * WALL_RESTITUTION
    }
}

/**
 * Advance the world by `dt` seconds. Pure: returns a new {@link World}, never mutates the input.
 * Handles integration, rolling friction, ball↔pin and pin↔pin collisions and side walls.
 */
export function stepWorld(world: World, dt: number): World {
    const ball: Ball = {...world.ball}
    const pins: Pin[] = world.pins.map(p => ({...p}))
    const damp = Math.max(0, 1 - DAMPING * dt)

    // Integrate + damp.
    if (!ball.gone) {
        ball.x += ball.vx * dt
        ball.y += ball.vy * dt
        ball.vx *= damp
        ball.vy *= damp
    }
    for (const p of pins) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= damp
        p.vy *= damp
    }

    // Ball ↔ pins.
    if (!ball.gone) {
        for (const p of pins) collide(ball, p, BALL_RADIUS, PIN_RADIUS, BALL_MASS, PIN_MASS)
    }
    // Pins ↔ pins.
    for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
            collide(pins[i], pins[j], PIN_RADIUS, PIN_RADIUS, PIN_MASS, PIN_MASS)
        }
    }

    // Walls (side rails).
    if (!ball.gone) bounceWalls(ball, BALL_RADIUS)
    for (const p of pins) bounceWalls(p, PIN_RADIUS)

    // Ball leaves the lane off the top or bottom → gone (out of play).
    if (!ball.gone && (ball.y + BALL_RADIUS < 0 || ball.y - BALL_RADIUS > LANE.height)) {
        ball.gone = true
        ball.vx = 0
        ball.vy = 0
    }

    // Kill tiny residual velocities so the world can come to rest.
    if (!ball.gone && speedOf(ball) < MIN_SPEED) {
        ball.vx = 0
        ball.vy = 0
    }
    for (const p of pins) {
        if (speedOf(p) < MIN_SPEED) {
            p.vx = 0
            p.vy = 0
        }
    }

    return {ball, pins}
}

/** True once nothing is moving (or the ball has left the lane and the pins have settled). */
export function worldAtRest(world: World): boolean {
    const ballStopped = world.ball.gone || speedOf(world.ball) === 0
    const pinsStopped = world.pins.every(p => speedOf(p) === 0)
    return ballStopped && pinsStopped
}

/**
 * Score the roll once the world is at rest: separate knocked pins from standing ones.
 * The caller adds `knocked.length` to the running score and keeps `standing` on the lane
 * (or re-racks when none remain).
 */
export function settleRoll(world: World): {knocked: Pin[]; standing: Pin[]} {
    const knocked: Pin[] = []
    const standing: Pin[] = []
    for (const p of world.pins) {
        if (isKnocked(p)) knocked.push(p)
        else standing.push(p)
    }
    return {knocked, standing}
}
