import {describe, it, expect} from 'vitest'
import {
    LANE,
    BALLS_PER_GAME,
    BALL_RADIUS,
    MAX_AIM_ANGLE,
    MAX_LAUNCH_SPEED,
    PIN_RADIUS,
    PIN_FALLEN_RADIUS,
    pinRadius,
    createRack,
    createBall,
    launchBall,
    stepWorld,
    worldAtRest,
    countStanding,
    isKnocked,
    pinDisplacement,
    settleRoll,
    type World,
} from '../bowlingGame'

describe('createRack', () => {
    it('builds a 9-pin diamond (1-2-3-2-1)', () => {
        const pins = createRack()
        expect(pins).toHaveLength(9)
        // Unique ids 0..8
        expect(new Set(pins.map(p => p.id)).size).toBe(9)
        // Row counts by y level
        const byRow = new Map<number, number>()
        for (const p of pins) byRow.set(p.y, (byRow.get(p.y) ?? 0) + 1)
        expect([...byRow.values()].sort((a, b) => a - b)).toEqual([1, 1, 2, 2, 3])
    })

    it('places every pin inside the lane and stores its origin', () => {
        for (const p of createRack()) {
            expect(p.x).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(LANE.width)
            expect(p.ox).toBe(p.x)
            expect(p.oy).toBe(p.y)
            expect(pinDisplacement(p)).toBe(0)
        }
    })

    it('is horizontally centred on the lane', () => {
        const xs = createRack().map(p => p.x)
        const mid = (Math.min(...xs) + Math.max(...xs)) / 2
        expect(mid).toBeCloseTo(LANE.width / 2, 5)
    })

    it('spans the full lane width — outer pins sit against the side rails', () => {
        const xs = createRack().map(p => p.x)
        expect(Math.min(...xs)).toBeCloseTo(PIN_RADIUS, 5)
        expect(Math.max(...xs)).toBeCloseTo(LANE.width - PIN_RADIUS, 5)
    })

    it('stands at the back of the lane, well clear of the release point', () => {
        const ys = createRack().map(p => p.y)
        const ball = createBall()
        // The whole rack sits in the far half, and the nearest pin is a long roll away.
        expect(Math.max(...ys)).toBeLessThan(LANE.height / 2)
        expect(ball.y - Math.max(...ys)).toBeGreaterThan(LANE.height / 4)
    })
})

describe('createBall', () => {
    it('parks at the bottom centre, at rest, in play', () => {
        const b = createBall()
        expect(b.x).toBeCloseTo(LANE.width / 2, 5)
        expect(b.y).toBeGreaterThan(LANE.height / 2)
        expect(b.vx).toBe(0)
        expect(b.vy).toBe(0)
        expect(b.gone).toBe(false)
    })
})

describe('launchBall', () => {
    it('sends the ball up the lane at full power (angle 0)', () => {
        const b = launchBall(createBall(), 0, 1)
        expect(b.vx).toBeCloseTo(0, 5)
        expect(b.vy).toBeCloseTo(-MAX_LAUNCH_SPEED, 5)
    })

    it('angles velocity toward the right wall for a positive angle', () => {
        const b = launchBall(createBall(), MAX_AIM_ANGLE, 1)
        expect(b.vx).toBeGreaterThan(0)
        expect(b.vy).toBeLessThan(0)
    })

    it('clamps power to [0,1]', () => {
        const fast = launchBall(createBall(), 0, 5)
        expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(MAX_LAUNCH_SPEED, 5)
        const slow = launchBall(createBall(), 0, -1)
        expect(Math.hypot(slow.vx, slow.vy)).toBe(0)
    })
})

describe('stepWorld', () => {
    it('is pure — does not mutate the input world', () => {
        const world: World = {ball: launchBall(createBall(), 0, 1), pins: createRack()}
        const snapshot = JSON.parse(JSON.stringify(world))
        stepWorld(world, 1 / 60)
        expect(world).toEqual(snapshot)
    })

    it('moves the ball along its velocity', () => {
        const world: World = {ball: launchBall(createBall(), 0, 1), pins: []}
        const next = stepWorld(world, 1 / 60)
        expect(next.ball.y).toBeLessThan(world.ball.y) // moved up
    })

    it('applies friction so the ball slows down', () => {
        let world: World = {ball: launchBall(createBall(), 0, 0.5), pins: []}
        const startSpeed = Math.hypot(world.ball.vx, world.ball.vy)
        for (let i = 0; i < 10; i++) world = stepWorld(world, 1 / 60)
        const endSpeed = Math.hypot(world.ball.vx, world.ball.vy)
        expect(endSpeed).toBeLessThan(startSpeed)
    })

    it('bounces the ball off a side wall (keeps it in the lane)', () => {
        // Aim hard toward the right wall with no pins in the way.
        let world: World = {ball: launchBall(createBall(), MAX_AIM_ANGLE, 1), pins: []}
        for (let i = 0; i < 120; i++) world = stepWorld(world, 1 / 60)
        expect(world.ball.x).toBeGreaterThanOrEqual(0)
        expect(world.ball.x).toBeLessThanOrEqual(LANE.width)
    })

    it('marks the ball gone once it rolls off the top', () => {
        let world: World = {ball: launchBall(createBall(), 0, 1), pins: []}
        let steps = 0
        while (!world.ball.gone && steps < 600) {
            world = stepWorld(world, 1 / 60)
            steps++
        }
        expect(world.ball.gone).toBe(true)
    })

    it('never tunnels a full-power ball through a pin, even on coarse frames', () => {
        // One pin dead ahead of the release point. At full power the ball covers more than a
        // ball+pin diameter per rendered frame, so without substepping it would skip right past it.
        const target = {id: 0, x: LANE.width / 2, y: 60, vx: 0, vy: 0, ox: LANE.width / 2, oy: 60, fall: 0, fallDir: 0}
        let world: World = {ball: launchBall(createBall(), 0, 1), pins: [target]}
        for (let i = 0; i < 60 && !world.ball.gone; i++) world = stepWorld(world, 0.032)
        expect(isKnocked(world.pins[0])).toBe(true)
    })

    it('leaves no overlapping pins once the world settles', () => {
        let world: World = {ball: launchBall(createBall(), 0, 1), pins: createRack()}
        let steps = 0
        while (!worldAtRest(world) && steps < 1000) {
            world = stepWorld(world, 1 / 60)
            steps++
        }
        for (let i = 0; i < world.pins.length; i++) {
            for (let j = i + 1; j < world.pins.length; j++) {
                const d = Math.hypot(world.pins[i].x - world.pins[j].x, world.pins[i].y - world.pins[j].y)
                expect(d).toBeGreaterThan(2 * PIN_RADIUS - 1)
            }
        }
    })

    it('leaves a ball that stops on the lane clear of the pins', () => {
        // Soft enough that the ball dies among the pins instead of rolling off the back.
        let world: World = {ball: launchBall(createBall(), 0, 0.4), pins: createRack()}
        let steps = 0
        while (!worldAtRest(world) && steps < 1000) {
            world = stepWorld(world, 1 / 60)
            steps++
        }
        expect(worldAtRest(world)).toBe(true)
        expect(world.ball.gone).toBe(false)
        for (const p of world.pins) {
            const d = Math.hypot(world.ball.x - p.x, world.ball.y - p.y)
            expect(d).toBeGreaterThan(BALL_RADIUS + PIN_RADIUS - 1)
        }
    })

    it('a hard straight throw eventually knocks down pins and comes to rest', () => {
        let world: World = {ball: launchBall(createBall(), 0, 1), pins: createRack()}
        let steps = 0
        while (!worldAtRest(world) && steps < 1000) {
            world = stepWorld(world, 1 / 60)
            steps++
        }
        expect(worldAtRest(world)).toBe(true)
        expect(countStanding(world.pins)).toBeLessThan(9) // at least one pin fell
    })
})

describe('toppling', () => {
    it('starts every pin upright with the standing collision radius', () => {
        for (const p of createRack()) {
            expect(p.fall).toBe(0)
            expect(pinRadius(p)).toBe(PIN_RADIUS)
        }
    })

    it('tips a struck pin over and grows its sweep to the fallen radius', () => {
        let world: World = {ball: launchBall(createBall(), 0, 1), pins: createRack()}
        let steps = 0
        while (steps < 400 && !world.pins.some(p => p.fall >= 1)) {
            world = stepWorld(world, 1 / 60)
            steps++
        }
        const flat = world.pins.filter(p => p.fall >= 1)
        expect(flat.length).toBeGreaterThan(0)
        for (const p of flat) {
            expect(isKnocked(p)).toBe(true)
            expect(Math.abs(p.fallDir)).toBe(1) // tipped to one definite side
            expect(pinRadius(p)).toBeCloseTo(PIN_FALLEN_RADIUS, 5)
        }
        // Untouched pins are still upright.
        for (const p of world.pins.filter(q => !isKnocked(q))) {
            expect(p.fall).toBe(0)
            expect(pinRadius(p)).toBe(PIN_RADIUS)
        }
    })

    it('rebounds pins off the machine instead of letting them leave the deck', () => {
        // Fire a pin hard at the back wall from just in front of it.
        const pin = {
            id: 0, x: LANE.width / 2, y: 40, vx: 0, vy: -400,
            ox: LANE.width / 2, oy: 40, fall: 0, fallDir: 0,
        }
        let world: World = {ball: {...createBall(), gone: true}, pins: [pin]}
        for (let i = 0; i < 200; i++) world = stepWorld(world, 1 / 60)
        expect(world.pins[0].y).toBeGreaterThanOrEqual(0)
        expect(isKnocked(world.pins[0])).toBe(true)
    })
})

describe('scoring helpers', () => {
    it('isKnocked / countStanding track displacement past the threshold', () => {
        const pins = createRack()
        expect(countStanding(pins)).toBe(9)
        pins[0].x += 100 // shove one pin far away
        expect(isKnocked(pins[0])).toBe(true)
        expect(countStanding(pins)).toBe(8)
    })

    it('settleRoll splits knocked from standing pins', () => {
        const pins = createRack()
        pins[0].y -= 100
        pins[1].x += 100
        const {knocked, standing} = settleRoll({ball: createBall(), pins})
        expect(knocked.map(p => p.id).sort()).toEqual([pins[0].id, pins[1].id].sort())
        expect(standing).toHaveLength(7)
    })
})

describe('constants', () => {
    it('exposes a sane number of balls per game', () => {
        expect(BALLS_PER_GAME).toBeGreaterThanOrEqual(1)
    })
})
