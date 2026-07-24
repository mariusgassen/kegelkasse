/**
 * Hidden mini 9-pin bowling game (Easter egg). Opened by tapping the app logo/title 5× quickly
 * (see RootLayout). A full-screen, kiosk-style overlay: aim with a sweeping guide (tap to lock),
 * set power with a sweeping meter (tap to launch), then watch the ball scatter the diamond rack.
 * Three balls per game; clearing all nine re-racks for a bonus. The best score is kept on-device.
 *
 * All physics live in the pure, tested `lib/bowlingGame` module — this component only wires up
 * input, the requestAnimationFrame loop and canvas rendering.
 */
import {useCallback, useEffect, useRef, useState} from 'react'
import {useT} from '../i18n'
import {useBowlingStore} from '../store/bowling'
import {
    BALLS_PER_GAME,
    LANE,
    BALL_RADIUS,
    PIN_RADIUS,
    MAX_AIM_ANGLE,
    createBall,
    createRack,
    launchBall,
    settleRoll,
    stepWorld,
    worldAtRest,
    type World,
} from '../lib/bowlingGame'

type Phase = 'aim' | 'power' | 'rolling' | 'gameover'

const RENDER_SCALE = 3 // logical lane units → canvas backing pixels
const MAX_ROLL_MS = 6000 // safety cap so a roll always settles

interface GameRef {
    phase: Phase
    world: World
    score: number
    ballsLeft: number
    aim: number // current aim angle (radians), oscillates during 'aim'
    aimDir: number
    power: number // current power 0..1, oscillates during 'power'
    powerDir: number
    rollStart: number
}

function freshGame(): GameRef {
    return {
        phase: 'aim',
        world: {ball: createBall(), pins: createRack()},
        score: 0,
        ballsLeft: BALLS_PER_GAME,
        aim: 0,
        aimDir: 1,
        power: 0,
        powerDir: 1,
        rollStart: 0,
    }
}

export function BowlingGame({onClose}: {onClose: () => void}) {
    const t = useT()
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const gameRef = useRef<GameRef>(freshGame())
    const highScore = useBowlingStore(s => s.highScore)
    const submitScore = useBowlingStore(s => s.submitScore)

    // HUD mirrors of the mutable game ref (only these trigger React re-renders).
    const [phase, setPhase] = useState<Phase>('aim')
    const [score, setScore] = useState(0)
    const [ballsLeft, setBallsLeft] = useState(BALLS_PER_GAME)
    const [flash, setFlash] = useState<string | null>(null)

    const draw = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return // jsdom / no-canvas: HUD still renders
        const g = gameRef.current

        ctx.save()
        ctx.scale(RENDER_SCALE, RENDER_SCALE)
        // Lane background
        ctx.fillStyle = '#2a2018'
        ctx.fillRect(0, 0, LANE.width, LANE.height)
        // Side rails
        ctx.fillStyle = '#3d3540'
        ctx.fillRect(0, 0, 3, LANE.height)
        ctx.fillRect(LANE.width - 3, 0, 3, LANE.height)
        // Foul line
        ctx.strokeStyle = 'rgba(232,160,32,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, LANE.height - 30)
        ctx.lineTo(LANE.width, LANE.height - 30)
        ctx.stroke()

        // Pins
        for (const p of g.world.pins) {
            ctx.fillStyle = '#e8c882'
            ctx.beginPath()
            ctx.arc(p.x, p.y, PIN_RADIUS, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = '#c4701a'
            ctx.lineWidth = 1.2
            ctx.stroke()
        }

        // Aim guide (while aiming)
        if (g.phase === 'aim' && !g.world.ball.gone) {
            const b = g.world.ball
            ctx.strokeStyle = 'rgba(232,160,32,0.7)'
            ctx.lineWidth = 1
            ctx.setLineDash([3, 3])
            ctx.beginPath()
            ctx.moveTo(b.x, b.y)
            ctx.lineTo(b.x + Math.sin(g.aim) * 60, b.y - Math.cos(g.aim) * 60)
            ctx.stroke()
            ctx.setLineDash([])
        }

        // Ball
        if (!g.world.ball.gone) {
            const b = g.world.ball
            ctx.fillStyle = '#e8a020'
            ctx.beginPath()
            ctx.arc(b.x, b.y, BALL_RADIUS, 0, Math.PI * 2)
            ctx.fill()
        }
        ctx.restore()
    }, [])

    const endRoll = useCallback(() => {
        const g = gameRef.current
        const {knocked, standing} = settleRoll(g.world)
        g.score += knocked.length
        g.ballsLeft -= 1
        const cleared = standing.length === 0
        // Re-rack on a full clear (Alle Neune) so the player can keep scoring.
        g.world = {ball: createBall(), pins: cleared ? createRack() : standing}

        setScore(g.score)
        setBallsLeft(g.ballsLeft)
        if (cleared) {
            setFlash(t('bowling.allNine'))
            setTimeout(() => setFlash(null), 1400)
        }

        if (g.ballsLeft <= 0) {
            g.phase = 'gameover'
            setPhase('gameover')
            submitScore(g.score)
        } else {
            g.phase = 'aim'
            g.aim = 0
            g.aimDir = 1
            g.power = 0
            g.powerDir = 1
            setPhase('aim')
        }
    }, [submitScore, t])

    // Main loop: oscillates the aim/power indicators, steps physics, redraws.
    useEffect(() => {
        let raf = 0
        let last = performance.now()
        const loop = (now: number) => {
            const dt = Math.min(0.032, (now - last) / 1000)
            last = now
            const g = gameRef.current

            if (g.phase === 'aim') {
                g.aim += g.aimDir * 1.6 * dt
                if (g.aim > MAX_AIM_ANGLE) {
                    g.aim = MAX_AIM_ANGLE
                    g.aimDir = -1
                } else if (g.aim < -MAX_AIM_ANGLE) {
                    g.aim = -MAX_AIM_ANGLE
                    g.aimDir = 1
                }
            } else if (g.phase === 'power') {
                g.power += g.powerDir * 1.3 * dt
                if (g.power > 1) {
                    g.power = 1
                    g.powerDir = -1
                } else if (g.power < 0.15) {
                    g.power = 0.15
                    g.powerDir = 1
                }
            } else if (g.phase === 'rolling') {
                g.world = stepWorld(g.world, dt)
                if (worldAtRest(g.world) || now - g.rollStart > MAX_ROLL_MS) {
                    endRoll()
                }
            }

            draw()
            raf = requestAnimationFrame(loop)
        }
        raf = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(raf)
    }, [draw, endRoll])

    // Esc closes.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    /** Primary tap on the play area: aim → power → launch. */
    const handleTap = useCallback(() => {
        const g = gameRef.current
        if (g.phase === 'aim') {
            g.phase = 'power'
            setPhase('power')
        } else if (g.phase === 'power') {
            g.world = {...g.world, ball: launchBall(g.world.ball, g.aim, g.power)}
            g.rollStart = performance.now()
            g.phase = 'rolling'
            setPhase('rolling')
        }
    }, [])

    const playAgain = useCallback(() => {
        gameRef.current = freshGame()
        setPhase('aim')
        setScore(0)
        setBallsLeft(BALLS_PER_GAME)
        setFlash(null)
    }, [])

    const hintKey =
        phase === 'aim' ? 'bowling.hint.aim'
            : phase === 'power' ? 'bowling.hint.power'
                : phase === 'rolling' ? 'bowling.hint.rolling'
                    : 'bowling.hint.gameover'

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={t('bowling.title')}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: '#1a1410',
                color: '#f5ecd8',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
            }}>
            {/* Header row: title, high score, close */}
            <div style={{display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 420, padding: '0 16px'}}>
                <div style={{fontWeight: 800, fontSize: 18, color: '#e8a020', flex: 1}}>
                    🎳 {t('bowling.title')}
                </div>
                <button
                    onClick={onClose}
                    aria-label={t('action.close')}
                    style={{
                        width: 40, height: 40, borderRadius: 20, border: 'none',
                        background: 'rgba(255,255,255,0.1)', color: '#f5ecd8', fontSize: 20, fontWeight: 700,
                    }}>
                    ✕
                </button>
            </div>

            {/* Scoreboard */}
            <div style={{display: 'flex', gap: 20, marginTop: 10, marginBottom: 10, fontSize: 13}}>
                <div><span style={{color: '#a08a7e'}}>{t('bowling.score')}: </span><b>{score}</b></div>
                <div><span style={{color: '#a08a7e'}}>{t('bowling.balls')}: </span><b>{'🎳'.repeat(Math.max(0, ballsLeft))}</b></div>
                <div><span style={{color: '#a08a7e'}}>{t('bowling.best')}: </span><b style={{color: '#e8a020'}}>{highScore}</b></div>
            </div>

            {/* Play area */}
            <div
                onClick={handleTap}
                style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', cursor: 'pointer', touchAction: 'none'}}>
                <canvas
                    ref={canvasRef}
                    data-testid="bowling-canvas"
                    width={LANE.width * RENDER_SCALE}
                    height={LANE.height * RENDER_SCALE}
                    style={{maxHeight: '100%', maxWidth: '100%', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.6)'}}/>

                {/* Power meter overlay */}
                {phase === 'power' && (
                    <div data-testid="bowling-power" style={{position: 'absolute', right: '10%', top: 0, bottom: 0, display: 'flex', alignItems: 'center'}}>
                        <div style={{width: 10, height: '60%', background: 'rgba(255,255,255,0.12)', borderRadius: 6, position: 'relative', overflow: 'hidden'}}>
                            <div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: `${gameRef.current.power * 100}%`, background: '#e8a020'}}/>
                        </div>
                    </div>
                )}

                {flash && (
                    <div style={{position: 'absolute', top: '30%', fontSize: 26, fontWeight: 900, color: '#e8a020', textShadow: '0 2px 12px rgba(0,0,0,0.7)'}}>
                        {flash}
                    </div>
                )}
            </div>

            {/* Footer: hint / game-over actions */}
            <div style={{minHeight: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '4px 16px'}}>
                {phase === 'gameover' ? (
                    <>
                        <div style={{fontSize: 15}}>
                            {score >= highScore && score > 0
                                ? t('bowling.newRecord')
                                : `${t('bowling.gameOver')} — ${score}`}
                        </div>
                        <button
                            onClick={playAgain}
                            style={{padding: '12px 28px', borderRadius: 10, border: 'none', background: '#e8a020', color: '#1a1410', fontWeight: 800, fontSize: 15}}>
                            {t('bowling.playAgain')}
                        </button>
                    </>
                ) : (
                    <div style={{fontSize: 14, color: '#c9b8a8', textAlign: 'center'}}>{t(hintKey)}</div>
                )}
            </div>
        </div>
    )
}
