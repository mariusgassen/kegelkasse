/**
 * Hidden mini 9-pin bowling game (Easter egg). Opened by tapping the app logo/title 5× quickly
 * (see RootLayout). A full-screen, kiosk-style overlay rendered in pseudo-3D: the flat top-down
 * physics from `lib/bowlingGame` is projected into a perspective lane (`lib/bowlingRender`), so the
 * pins visibly topple and fall down the receding lane.
 *
 * Controls: swipe up the lane to throw — the swipe direction sets the aim, its length the power.
 * Modelled on a real German Kegelbahn (VOLLMER string-pin machine): a diamond of lamps shows which
 * pins still stand, a green 7-segment display keeps the current throw and running total, and a
 * little Wimpel (pennant) on the machine carries the club logo. Three throws per game, each with a
 * fresh rack of nine — so the maximum score is 3×9 = 27. Finished games go to the club-wide
 * leaderboard (a local best is kept as an offline fallback).
 */
import {useCallback, useEffect, useRef, useState} from 'react'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '../i18n'
import {api} from '../api/client'
import {useBowlingStore} from '../store/bowling'
import type {BowlingSubmitResult} from '../types'
import {
    BALLS_PER_GAME,
    BALL_RADIUS,
    LANE,
    MAX_AIM_ANGLE,
    createBall,
    createRack,
    isKnocked,
    launchBall,
    stepWorld,
    worldAtRest,
    type World,
} from '../lib/bowlingGame'
import {
    project,
    segmentsFor,
    PIN_HEIGHT,
    VIEW_W,
    VIEW_H,
    MACHINE_H,
    LANE_TOP,
    LANE_BOTTOM,
} from '../lib/bowlingRender'

type Phase = 'ready' | 'rolling' | 'gameover'

const THROWS = BALLS_PER_GAME // 3
const MAX_ROLL_MS = 6000 // safety cap so a roll always settles
const MAX_TILT = Math.PI / 2 * 0.96
const SWIPE_MIN = 22 // min upward travel (backing px) to count as a throw
const SWIPE_FULL = 300 // swipe length (backing px) for full power
const MIN_POWER = 0.3 // a flick still has to be worth something

// Canonical rack (id → resting position) for the machine's standing-pin lamp diamond.
const RACK_LAYOUT = createRack()
// Rack extents, so the lamp diamond keeps mirroring the rack if its geometry ever changes.
const RACK_BOUNDS = {
    cx: (Math.min(...RACK_LAYOUT.map(p => p.ox)) + Math.max(...RACK_LAYOUT.map(p => p.ox))) / 2,
    cy: (Math.min(...RACK_LAYOUT.map(p => p.oy)) + Math.max(...RACK_LAYOUT.map(p => p.oy))) / 2,
    hx: (Math.max(...RACK_LAYOUT.map(p => p.ox)) - Math.min(...RACK_LAYOUT.map(p => p.ox))) / 2,
    hy: (Math.max(...RACK_LAYOUT.map(p => p.oy)) - Math.min(...RACK_LAYOUT.map(p => p.oy))) / 2,
}
// Half-extents (px) of the lamp diamond on the machine panel.
const LAMP_HX = 46
const LAMP_HY = 30

interface GameRef {
    phase: Phase
    world: World
    total: number
    lastThrow: number
    throwsLeft: number
    rollStart: number
}

interface DragRef {
    active: boolean
    x0: number
    y0: number
    x1: number
    y1: number
}

function freshThrow(): World {
    return {ball: createBall(), pins: createRack()}
}

function freshGame(): GameRef {
    return {
        phase: 'ready',
        world: freshThrow(),
        total: 0,
        lastThrow: 0,
        throwsLeft: THROWS,
        rollStart: 0,
    }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// ── canvas drawing helpers (module-level; pure canvas, no React) ────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, r)
    } else {
        ctx.beginPath()
        ctx.rect(x, y, w, h)
    }
}

/** One 7-segment digit in a W×H cell at (x,y). */
function drawDigit(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, W: number, H: number, on: string, off: string) {
    const T = W * 0.17
    const seg = segmentsFor(ch)
    const halfV = (H - 3 * T) / 2
    const bars: [number, number, number, number][] = [
        [x + T, y, W - 2 * T, T],                       // a
        [x + W - T, y + T * 0.6, T, halfV],             // b
        [x + W - T, y + H / 2 + T * 0.4, T, halfV],     // c
        [x + T, y + H - T, W - 2 * T, T],               // d
        [x, y + H / 2 + T * 0.4, T, halfV],             // e
        [x, y + T * 0.6, T, halfV],                     // f
        [x + T, y + (H - T) / 2, W - 2 * T, T],         // g
    ]
    bars.forEach(([bx, by, bw, bh], i) => {
        ctx.fillStyle = seg[i] ? on : off
        roundRect(ctx, bx, by, bw, bh, T * 0.35)
        ctx.fill()
    })
}

/** A right-aligned 7-segment number ending at rightX. */
function drawSevenSeg(ctx: CanvasRenderingContext2D, value: number, rightX: number, y: number, cellW: number, cellH: number, color: string) {
    const off = 'rgba(90,130,50,0.18)'
    const gap = cellW * 0.28
    const str = String(Math.max(0, value))
    let cx = rightX - cellW
    for (let i = str.length - 1; i >= 0; i--) {
        drawDigit(ctx, str[i], cx, y, cellW, cellH, color, off)
        cx -= cellW + gap
    }
}

/** A German Kegel (bowling pin) standing on its base at (0,0) in the current transform. */
function drawPinShape(ctx: CanvasRenderingContext2D, h: number) {
    const w = h * 0.36
    const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
    grad.addColorStop(0, '#cfc7b6')
    grad.addColorStop(0.4, '#f4efe4')
    grad.addColorStop(1, '#ffffff')
    ctx.fillStyle = grad
    // Body silhouette: bulbous belly → narrow neck → round head, mirrored around x=0.
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(-w * 0.55, -h * 0.12, -w * 0.5, -h * 0.34) // belly out
    ctx.quadraticCurveTo(-w * 0.44, -h * 0.55, -w * 0.16, -h * 0.66) // in to neck
    ctx.quadraticCurveTo(-w * 0.30, -h * 0.80, -w * 0.20, -h * 0.90) // head left
    ctx.quadraticCurveTo(0, -h * 1.02, w * 0.20, -h * 0.90)          // head top
    ctx.quadraticCurveTo(w * 0.30, -h * 0.80, w * 0.16, -h * 0.66)   // head right
    ctx.quadraticCurveTo(w * 0.44, -h * 0.55, w * 0.5, -h * 0.34)    // out to belly
    ctx.quadraticCurveTo(w * 0.55, -h * 0.12, 0, 0)
    ctx.closePath()
    ctx.fill()
    // Red neck ring (nods to the app logo pin).
    ctx.strokeStyle = 'rgba(196,57,43,0.85)'
    ctx.lineWidth = Math.max(1, h * 0.05)
    ctx.beginPath()
    ctx.moveTo(-w * 0.20, -h * 0.60)
    ctx.quadraticCurveTo(0, -h * 0.55, w * 0.20, -h * 0.60)
    ctx.stroke()
}

/** A shaded amber ball (sphere) of radius r at (cx,cy). */
function drawBallShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.15, cx, cy, r)
    g.addColorStop(0, '#ffd27a')
    g.addColorStop(0.5, '#e8a020')
    g.addColorStop(1, '#9c5b12')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
}

type LogoRef = {img: HTMLImageElement; ready: boolean} | null

/** Club Wimpel (pennant) in the top-left corner of the machine. */
function drawWimpel(ctx: CanvasRenderingContext2D, clubName: string, clubColor: string, logo: LogoRef) {
    const px = 10, py = 6, pw = 58, ph = 34
    ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + ph + 6); ctx.stroke()
    ctx.fillStyle = clubColor
    ctx.beginPath()
    ctx.moveTo(px + 1, py + 2); ctx.lineTo(px + pw, py + 2); ctx.lineTo(px + 1, py + ph); ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke()
    if (logo && logo.ready) {
        try { ctx.drawImage(logo.img, px + 4, py + 5, 18, 18) } catch { /* tainted/broken → skip */ }
    } else {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 15px sans-serif'
        ctx.fillText((clubName[0] || 'K').toUpperCase(), px + 6, py + 20)
    }
}

/** The VOLLMER-style back machine: pinstripe panel, standing-pin lamp diamond, 7-segment strip. */
function drawMachine(ctx: CanvasRenderingContext2D, g: GameRef, clubName: string, clubColor: string, logo: LogoRef) {
    // Blue panel with yellow pinstripes.
    ctx.fillStyle = '#21508f'
    ctx.fillRect(0, 0, VIEW_W, MACHINE_H)
    ctx.strokeStyle = 'rgba(232,200,80,0.55)'
    ctx.lineWidth = 1.5
    for (let yy = 10; yy < MACHINE_H - 34; yy += 9) {
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(VIEW_W, yy); ctx.stroke()
    }
    // Standing-pin lamp diamond (mirrors the rack; lit = pin still standing).
    const standing = new Set(g.world.pins.filter(p => !isKnocked(p)).map(p => p.id))
    const cx = VIEW_W / 2, cy = 52
    for (const layout of RACK_LAYOUT) {
        const lx = cx + ((layout.ox - RACK_BOUNDS.cx) / RACK_BOUNDS.hx) * LAMP_HX
        const ly = cy + ((layout.oy - RACK_BOUNDS.cy) / RACK_BOUNDS.hy) * LAMP_HY
        if (standing.has(layout.id)) {
            const gg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 7)
            gg.addColorStop(0, '#fff0c0'); gg.addColorStop(0.6, '#ffcf5a'); gg.addColorStop(1, '#c8901e')
            ctx.fillStyle = gg
        } else {
            ctx.fillStyle = '#3a3320'
        }
        ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill()
    }
    // 7-segment scoreboard strip: [throw no.] · [pins this throw] · [total].
    const stripY = MACHINE_H - 30
    ctx.fillStyle = '#0d0f0a'
    ctx.fillRect(0, stripY, VIEW_W, 30)
    const green = '#7bff3a'
    const cellW = 13, cellH = 22, sy = stripY + 4
    const throwNo = Math.min(THROWS, THROWS - g.throwsLeft + 1)
    drawSevenSeg(ctx, throwNo, 66, sy, cellW, cellH, green)
    drawSevenSeg(ctx, g.lastThrow, VIEW_W / 2 + 26, sy, cellW, cellH, green)
    drawSevenSeg(ctx, g.total, VIEW_W - 14, sy, cellW, cellH, green)
    ctx.fillStyle = 'rgba(123,255,58,0.5)'
    ctx.font = '7px monospace'
    ctx.fillText('WURF', 30, stripY - 2)
    ctx.fillText('KEGEL', VIEW_W / 2 - 20, stripY - 2)
    ctx.fillText('GESAMT', VIEW_W - 58, stripY - 2)

    drawWimpel(ctx, clubName, clubColor, logo)
}

export function BowlingGame({onClose}: {onClose: () => void}) {
    const t = useT()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const gameRef = useRef<GameRef>(freshGame())
    const dragRef = useRef<DragRef>({active: false, x0: 0, y0: 0, x1: 0, y1: 0})
    const logoRef = useRef<{img: HTMLImageElement; ready: boolean} | null>(null)
    const queryClient = useQueryClient()
    const markDiscovered = useBowlingStore(s => s.markDiscovered)
    const submitLocal = useBowlingStore(s => s.submitLocal)
    const personalBest = useBowlingStore(s => s.personalBest)

    // Reveal the profile leaderboard section only once the Easter egg has actually been found.
    useEffect(() => { markDiscovered() }, [markDiscovered])

    const {data: leaderboard} = useQuery({queryKey: ['bowling-leaderboard'], queryFn: api.getBowlingLeaderboard})
    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})
    const clubBest = leaderboard?.[0]?.score ?? 0
    const highScore = Math.max(clubBest, personalBest)

    // Load the club logo for the machine Wimpel (same-origin upload → safe to drawImage).
    useEffect(() => {
        const url = club?.settings?.logo_url
        if (!url) { logoRef.current = null; return }
        const img = new Image()
        const entry = {img, ready: false}
        img.onload = () => { entry.ready = true }
        img.src = url
        logoRef.current = entry
    }, [club?.settings?.logo_url])

    // HUD mirrors of the mutable game ref (only these trigger React re-renders).
    const [phase, setPhase] = useState<Phase>('ready')
    const [flash, setFlash] = useState<string | null>(null)
    const [result, setResult] = useState<BowlingSubmitResult | null>(null)
    // Bump to force a re-render of DOM HUD bits after a throw settles.
    const [, setTick] = useState(0)

    const {mutate: submitScoreRemote} = useMutation({
        mutationFn: (s: number) => api.submitBowlingScore(s),
        onSuccess: (res) => {
            setResult(res)
            queryClient.invalidateQueries({queryKey: ['bowling-leaderboard']})
        },
    })
    const submitScore = useCallback((s: number) => {
        submitLocal(s) // offline fallback
        submitScoreRemote(s)
    }, [submitLocal, submitScoreRemote])

    // Club identity is read from refs inside the (stable) draw loop so it stays current when the
    // club query resolves after mount, without re-creating `draw` and restarting the rAF loop.
    const clubNameRef = useRef('')
    const clubColorRef = useRef('#e8a020')
    clubNameRef.current = club?.name || t('app.name')
    clubColorRef.current = club?.settings?.primary_color || '#e8a020'

    // ── drawing ──────────────────────────────────────────────────────────────
    const draw = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return // jsdom / no-canvas: DOM HUD still renders
        const g = gameRef.current

        ctx.clearRect(0, 0, VIEW_W, VIEW_H)

        // Lane trapezoid corners.
        const fl = project(0, 0), fr = project(LANE.width, 0)
        const nl = project(0, LANE.height), nr = project(LANE.width, LANE.height)

        // Green side rails (drawn wide behind the lane).
        ctx.fillStyle = '#2f7d32'
        ctx.beginPath()
        ctx.moveTo(fl.sx - 10, LANE_TOP); ctx.lineTo(fl.sx, LANE_TOP)
        ctx.lineTo(nl.sx, LANE_BOTTOM); ctx.lineTo(nl.sx - 60, LANE_BOTTOM)
        ctx.closePath(); ctx.fill()
        ctx.beginPath()
        ctx.moveTo(fr.sx + 10, LANE_TOP); ctx.lineTo(fr.sx, LANE_TOP)
        ctx.lineTo(nr.sx, LANE_BOTTOM); ctx.lineTo(nr.sx + 60, LANE_BOTTOM)
        ctx.closePath(); ctx.fill()

        // Wood lane.
        const wood = ctx.createLinearGradient(0, LANE_TOP, 0, LANE_BOTTOM)
        wood.addColorStop(0, '#5a3a1f')
        wood.addColorStop(0.5, '#8a5a2f')
        wood.addColorStop(1, '#a06a35')
        ctx.fillStyle = wood
        ctx.beginPath()
        ctx.moveTo(fl.sx, fl.sy); ctx.lineTo(fr.sx, fr.sy)
        ctx.lineTo(nr.sx, nr.sy); ctx.lineTo(nl.sx, nl.sy)
        ctx.closePath(); ctx.fill()
        // Subtle centre sheen.
        ctx.strokeStyle = 'rgba(255,220,150,0.10)'
        ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo((fl.sx + fr.sx) / 2, fl.sy); ctx.lineTo((nl.sx + nr.sx) / 2, nl.sy); ctx.stroke()
        // Foul line near the release point.
        const foul = project(0, LANE.height * 0.82), foulR = project(LANE.width, LANE.height * 0.82)
        ctx.strokeStyle = 'rgba(230,160,40,0.5)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(foul.sx, foul.sy); ctx.lineTo(foulR.sx, foulR.sy); ctx.stroke()

        drawMachine(ctx, g, clubNameRef.current, clubColorRef.current, logoRef.current)

        // Pins, far (smaller y) first so nearer pins overlap correctly.
        const pins = [...g.world.pins].sort((a, b) => a.y - b.y)
        for (const p of pins) {
            const pr = project(p.x, p.y)
            const h = PIN_HEIGHT * pr.scale
            // Topple progress comes straight from the simulation, so the sprite always matches the
            // (larger) sweep a falling pin actually has on the deck.
            const tilt = p.fallDir * clamp01(p.fall) * MAX_TILT
            ctx.save()
            ctx.translate(pr.sx, pr.sy)
            ctx.rotate(tilt)
            // soft ground shadow
            ctx.fillStyle = 'rgba(0,0,0,0.18)'
            ctx.beginPath(); ctx.ellipse(0, 0, h * 0.22, h * 0.07, 0, 0, Math.PI * 2); ctx.fill()
            drawPinShape(ctx, h)
            ctx.restore()
        }

        // Ball.
        if (!g.world.ball.gone) {
            const b = project(g.world.ball.x, g.world.ball.y)
            const r = BALL_RADIUS * b.scale
            ctx.fillStyle = 'rgba(0,0,0,0.2)'
            ctx.beginPath(); ctx.ellipse(b.sx, b.sy + r * 0.4, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill()
            drawBallShape(ctx, b.sx, b.sy - r * 0.4, r)
        }

        // Aim guide while swiping.
        const d = dragRef.current
        if (g.phase === 'ready' && d.active) {
            const dx = d.x1 - d.x0, dy = d.y1 - d.y0
            if (dy < 0) {
                const b = project(g.world.ball.x, g.world.ball.y)
                ctx.strokeStyle = 'rgba(232,160,32,0.85)'
                ctx.lineWidth = 3
                ctx.setLineDash([6, 6])
                ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(b.sx + dx, b.sy + dy); ctx.stroke()
                ctx.setLineDash([])
                // power dot at the end
                const power = clamp01(Math.hypot(dx, dy) / SWIPE_FULL)
                ctx.fillStyle = `rgba(${Math.round(120 + power * 135)},${Math.round(200 - power * 160)},60,0.95)`
                ctx.beginPath(); ctx.arc(b.sx + dx, b.sy + dy, 6, 0, Math.PI * 2); ctx.fill()
            }
        }
    }, [])

    const endThrow = useCallback(() => {
        const g = gameRef.current
        const knocked = g.world.pins.filter(isKnocked).length
        g.total += knocked
        g.lastThrow = knocked
        g.throwsLeft -= 1
        if (knocked === 9) {
            setFlash(t('bowling.allNine'))
            setTimeout(() => setFlash(null), 1400)
        }
        if (g.throwsLeft <= 0) {
            g.phase = 'gameover'
            setPhase('gameover')
            submitScore(g.total)
        } else {
            g.world = freshThrow()
            g.rollStart = 0
            g.phase = 'ready'
            setPhase('ready')
        }
        setTick(n => n + 1)
    }, [submitScore, t])

    // Main loop: steps physics while rolling, redraws every frame.
    useEffect(() => {
        let raf = 0
        let last = performance.now()
        const loop = (now: number) => {
            const dt = Math.min(0.032, (now - last) / 1000)
            last = now
            const g = gameRef.current
            if (g.phase === 'rolling') {
                g.world = stepWorld(g.world, dt)
                if (worldAtRest(g.world) || now - g.rollStart > MAX_ROLL_MS) endThrow()
            }
            draw()
            raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }, [draw, endThrow])

    // Esc closes.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // ── swipe-to-throw input ───────────────────────────────────────────────────
    function toBacking(e: React.PointerEvent): {x: number; y: number} {
        const c = canvasRef.current
        if (!c) return {x: 0, y: 0}
        const r = c.getBoundingClientRect()
        const w = r.width || 1, h = r.height || 1
        return {x: (e.clientX - r.left) / w * VIEW_W, y: (e.clientY - r.top) / h * VIEW_H}
    }
    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        // Suppress the browser's own press-and-hold gesture (text selection / callout / drag), which
        // otherwise fires mid-swipe and paints a selection over the whole panel.
        e.preventDefault()
        if (gameRef.current.phase !== 'ready') return
        // Capture so the throw still lands if the finger drifts off the canvas mid-swipe.
        e.currentTarget.setPointerCapture?.(e.pointerId)
        const p = toBacking(e)
        dragRef.current = {active: true, x0: p.x, y0: p.y, x1: p.x, y1: p.y}
    }
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current.active) return
        e.preventDefault()
        const p = toBacking(e)
        dragRef.current.x1 = p.x
        dragRef.current.y1 = p.y
    }
    const onPointerUp = () => {
        const d = dragRef.current
        d.active = false
        const g = gameRef.current
        if (g.phase !== 'ready') return
        const dx = d.x1 - d.x0, dy = d.y1 - d.y0
        if (-dy < SWIPE_MIN) return // not a clear upward swipe
        const angle = Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, Math.atan2(dx, -dy)))
        const power = Math.max(MIN_POWER, Math.min(1, Math.hypot(dx, dy) / SWIPE_FULL))
        g.world = {...g.world, ball: launchBall(g.world.ball, angle, power)}
        g.rollStart = performance.now()
        g.phase = 'rolling'
        setPhase('rolling')
    }

    const playAgain = useCallback(() => {
        gameRef.current = freshGame()
        dragRef.current = {active: false, x0: 0, y0: 0, x1: 0, y1: 0}
        setPhase('ready')
        setFlash(null)
        setResult(null)
        setTick(n => n + 1)
    }, [])

    const g = gameRef.current
    const hintKey = phase === 'rolling' ? 'bowling.hint.rolling' : 'bowling.hint.swipe'

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('bowling.title')}
            onContextMenu={e => e.preventDefault()}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999, background: '#1a1410', color: '#f5ecd8',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                // Press-and-hold on a canvas game must not select the surrounding HUD text or pop
                // the iOS copy/share callout.
                userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
                touchAction: 'none',
            }}>
            {/* Header: title, best, close */}
            <div style={{display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, padding: '0 16px'}}>
                <div style={{fontWeight: 800, fontSize: 18, color: '#e8a020', flex: 1}}>🎳 {t('bowling.title')}</div>
                <div style={{fontSize: 12, color: '#a08a7e'}}>{t('bowling.best')}: <b style={{color: '#e8a020'}}>{highScore}</b></div>
                <button
                    onClick={onClose}
                    aria-label={t('action.close')}
                    style={{width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#f5ecd8', fontSize: 20, fontWeight: 700}}>
                    ✕
                </button>
            </div>

            {/* Play area (perspective lane) */}
            <div style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%'}}>
                <canvas
                    ref={canvasRef}
                    data-testid="bowling-canvas"
                    width={VIEW_W}
                    height={VIEW_H}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    style={{
                        maxHeight: '100%', maxWidth: '100%', borderRadius: 12,
                        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                    }}/>

                {flash && (
                    <div style={{position: 'absolute', top: '28%', fontSize: 26, fontWeight: 900, color: '#e8a020', textShadow: '0 2px 12px rgba(0,0,0,0.7)', pointerEvents: 'none'}}>
                        {flash}
                    </div>
                )}
            </div>

            {/* Footer: hint / game-over actions */}
            <div style={{minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 16px'}}>
                {phase === 'gameover' ? (
                    <>
                        <div style={{fontSize: 15}} data-testid="bowling-result">
                            {result?.is_record ? t('bowling.newRecord') : `${t('bowling.gameOver')} — ${g.total}`}
                        </div>
                        <button
                            onClick={playAgain}
                            style={{padding: '12px 28px', borderRadius: 10, border: 'none', background: '#e8a020', color: '#1a1410', fontWeight: 800, fontSize: 15}}>
                            {t('bowling.playAgain')}
                        </button>
                    </>
                ) : (
                    <div style={{fontSize: 14, color: '#c9b8a8', textAlign: 'center'}} data-testid="bowling-hint">{t(hintKey)}</div>
                )}
            </div>
        </div>
    )
}
