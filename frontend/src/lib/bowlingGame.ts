/**
 * Pure, deterministic logic for the hidden mini 9-pin bowling game (Easter egg — 5 quick taps on
 * the app logo). Kept framework-free so it is fully unit-testable; the React component
 * (`components/BowlingGame.tsx`) only orchestrates input, the rAF loop and canvas rendering.
 *
 * Coordinate space is a fixed logical lane; the renderer projects it into a perspective view. The
 * lane runs bottom→top: the ball launches from the bottom centre and rolls "up" (negative y) toward
 * a diamond rack of 9 pins standing right at the *back* of the lane — the classic German Kegeln
 * arrangement (1-2-3-2-1), spread across the full lane width.
 */

/** Logical lane. The long approach keeps the rack visibly at the far end. */
export const LANE = {width: 120, height: 460}
export const BALL_RADIUS = 9
/** Collision radius of a pin standing upright. */
export const PIN_RADIUS = 7
/**
 * Collision radius of a pin lying flat. A toppled Kegel sweeps its whole length across the deck,
 * which is exactly why a sparse German diamond can be cleared at all — upright pins are far too
 * small and far too widely spaced to knock each other over on their own.
 */
export const PIN_FALLEN_RADIUS = 20
/** Seconds a struck pin takes to go from upright to flat (and to reach its full sweep). */
export const TOPPLE_SECONDS = 0.35
/** Displacement from a pin's origin, in lane units, beyond which it counts as knocked down. */
export const KNOCK_THRESHOLD = 9
/** Fastest launch speed (lane units / second) at full power. */
export const MAX_LAUNCH_SPEED = 520
/** Number of balls (rolls) per game. */
export const BALLS_PER_GAME = 3
/** Widest aim angle either side of straight-up, in radians (~14°) — enough to reach either outer pin. */
export const MAX_AIM_ANGLE = 0.25

/**
 * Horizontal centre-to-centre spacing within a rack row. Sized so the widest row (3 pins) spans the
 * whole lane width: the outer pins sit one pin radius clear of each side rail.
 */
export const PIN_SPACING = LANE.width / 2 - PIN_RADIUS
/**
 * Vertical pitch between rack rows. A 9-pin diamond is a 3×3 grid rotated 45°, so consecutive rows
 * are offset by *half* the in-row spacing — that is what makes the diamond square (equally wide and
 * deep) and puts every pin the same distance from its diagonal neighbours.
 */
const ROW_PITCH = PIN_SPACING / 2
/** Depth of the rack centre — the diamond stands right at the back of the lane. */
export const RACK_CENTRE_Y = 68
/** Distance of the release point from the near end of the lane. */
const RELEASE_INSET = 25

const BALL_MASS = 3
const PIN_MASS = 1
const RESTITUTION = 0.45
const WALL_RESTITUTION = 0.5
/**
 * Constant deceleration (lane units / s²). Sliding friction rather than exponential damping, so a
 * roll always reaches a hard stop in bounded time instead of asymptotically creeping. Pins are
 * light and scrape to a halt far quicker than the rolling ball.
 */
const BALL_FRICTION = 60
const PIN_FRICTION = 200
/** Below this speed an entity is treated as stopped. */
const MIN_SPEED = 5
/**
 * Collision correctness: never integrate further than this many lane units in one substep. At full
 * power the ball covers ~17 units per rendered frame — more than a ball+pin radius sum — so without
 * substepping it would tunnel straight through pins instead of hitting them.
 */
const MAX_SUBSTEP_TRAVEL = 3
const MAX_SUBSTEPS = 16
/** Contact solver passes per substep, so a struck pin cluster resolves instead of staying overlapped. */
const SOLVER_ITERATIONS = 2
/** How deep bodies may still interpenetrate and count as settled (lane units). */
const REST_PENETRATION_SLOP = 0.5

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
    /** Topple progress: 0 = upright, 1 = flat on the deck. Drives both the sweep and the sprite. */
    fall: number
    /** Which way it tips (+1 right / -1 left), captured the moment it is first knocked. */
    fallDir: number
}

export interface World {
    ball: Ball
    pins: Pin[]
}

/** The 9-pin diamond rack (1-2-3-2-1), standing at the back of the lane across its full width. */
export function createRack(): Pin[] {
    const cx = LANE.width / 2
    // rowOffset (vertical, in units of ROW_PITCH) → count of pins in that row
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
        const y = RACK_CENTRE_Y + row * ROW_PITCH
        // Centre the row horizontally: offsets are symmetric around 0.
        const startOffset = -((count - 1) / 2)
        for (let i = 0; i < count; i++) {
            const x = cx + (startOffset + i) * PIN_SPACING
            pins.push({id: id++, x, y, vx: 0, vy: 0, ox: x, oy: y, fall: 0, fallDir: 0})
        }
    }
    return pins
}

/** A fresh ball parked at the bottom-centre release point. */
export function createBall(): Ball {
    return {x: LANE.width / 2, y: LANE.height - RELEASE_INSET, vx: 0, vy: 0, gone: false}
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

/** Collision radius of a pin at its current topple progress. */
export function pinRadius(pin: Pin): number {
    return PIN_RADIUS + (PIN_FALLEN_RADIUS - PIN_RADIUS) * pin.fall
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
 * The back panel of the pin machine, immediately behind the rack. Struck pins rebound off it back
 * into their neighbours instead of disappearing off the deck — on a real Kegelbahn that rebound is
 * a big part of how a sparse diamond gets cleared.
 */
function bounceBackWall(e: Entity, r: number): void {
    if (e.y - r < 0) {
        e.y = r
        e.vy = Math.abs(e.vy) * WALL_RESTITUTION
    }
}

/** Constant-deceleration friction; snaps to a full stop once the entity is crawling. */
function decelerate(e: Entity, a: number, dt: number): void {
    const sp = speedOf(e)
    if (sp === 0) return
    const next = sp - a * dt
    if (next <= MIN_SPEED) {
        e.vx = 0
        e.vy = 0
        return
    }
    const k = next / sp
    e.vx *= k
    e.vy *= k
}

/** One fixed physics substep, mutating the (already copied) entities in place. */
function substep(ball: Ball, pins: Pin[], dt: number): void {
    if (!ball.gone) {
        ball.x += ball.vx * dt
        ball.y += ball.vy * dt
        decelerate(ball, BALL_FRICTION, dt)
    }
    for (const p of pins) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        decelerate(p, PIN_FRICTION, dt)
    }

    const radii = pins.map(pinRadius)
    for (let it = 0; it < SOLVER_ITERATIONS; it++) {
        // Ball ↔ pins.
        if (!ball.gone) {
            for (let i = 0; i < pins.length; i++) {
                collide(ball, pins[i], BALL_RADIUS, radii[i], BALL_MASS, PIN_MASS)
            }
        }
        // Pins ↔ pins.
        for (let i = 0; i < pins.length; i++) {
            for (let j = i + 1; j < pins.length; j++) {
                collide(pins[i], pins[j], radii[i], radii[j], PIN_MASS, PIN_MASS)
            }
        }
    }

    // Walls (side rails). A toppled pin is measured by its upright footprint here — it has already
    // fallen, so it may hang over the channel rather than being shoved back onto the deck.
    if (!ball.gone) bounceWalls(ball, BALL_RADIUS)
    for (const p of pins) {
        bounceWalls(p, PIN_RADIUS)
        bounceBackWall(p, PIN_RADIUS)
    }

    // Topple progress: a pin starts going over the moment it counts as knocked.
    for (const p of pins) {
        if (p.fall === 0) {
            if (!isKnocked(p)) continue
            p.fallDir = p.vx >= 0 ? 1 : -1
        }
        p.fall = Math.min(1, p.fall + dt / TOPPLE_SECONDS)
    }

    // Ball leaves the lane off the top or bottom → gone (out of play).
    if (!ball.gone && (ball.y + BALL_RADIUS < 0 || ball.y - BALL_RADIUS > LANE.height)) {
        ball.gone = true
        ball.vx = 0
        ball.vy = 0
    }
}

/**
 * Advance the world by `dt` seconds. Pure: returns a new {@link World}, never mutates the input.
 * Handles integration, sliding friction, ball↔pin and pin↔pin collisions and side walls.
 *
 * The frame is split into fixed substeps sized so nothing travels more than
 * {@link MAX_SUBSTEP_TRAVEL} lane units at a time — without that, a full-power ball would skip
 * past a whole pin between frames and register no hit.
 */
export function stepWorld(world: World, dt: number): World {
    const ball: Ball = {...world.ball}
    const pins: Pin[] = world.pins.map(p => ({...p}))

    let fastest = ball.gone ? 0 : speedOf(ball)
    for (const p of pins) fastest = Math.max(fastest, speedOf(p))
    const substeps = Math.min(
        MAX_SUBSTEPS,
        Math.max(1, Math.ceil((fastest * dt) / MAX_SUBSTEP_TRAVEL)),
    )
    const h = dt / substeps
    for (let s = 0; s < substeps; s++) substep(ball, pins, h)

    return {ball, pins}
}

/** True while any two bodies are still meaningfully interpenetrating. */
function anyPenetration(world: World): boolean {
    const {ball, pins} = world
    for (let i = 0; i < pins.length; i++) {
        if (!ball.gone) {
            const d = Math.hypot(ball.x - pins[i].x, ball.y - pins[i].y)
            if (d < BALL_RADIUS + pinRadius(pins[i]) - REST_PENETRATION_SLOP) return true
        }
        for (let j = i + 1; j < pins.length; j++) {
            const d = Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y)
            if (d < pinRadius(pins[i]) + pinRadius(pins[j]) - REST_PENETRATION_SLOP) return true
        }
    }
    return false
}

/**
 * True once nothing is moving (or the ball has left the lane and the pins have settled) *and*
 * nothing is still clipping through anything else.
 *
 * The penetration check matters: friction can zero out velocities while bodies are still overlapped
 * from the impact. Reporting rest there would freeze pins visibly inside each other — the contact
 * solver needs a few more (motionless) frames of positional correction to push them apart first.
 */
export function worldAtRest(world: World): boolean {
    const ballStopped = world.ball.gone || speedOf(world.ball) === 0
    const pinsStopped = world.pins.every(p => speedOf(p) === 0)
    return ballStopped && pinsStopped && !anyPenetration(world)
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
