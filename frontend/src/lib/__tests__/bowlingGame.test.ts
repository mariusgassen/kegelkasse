import {describe, it, expect} from 'vitest'
import {
    LANE,
    BALLS_PER_GAME,
    MAX_AIM_ANGLE,
    MAX_LAUNCH_SPEED,
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
