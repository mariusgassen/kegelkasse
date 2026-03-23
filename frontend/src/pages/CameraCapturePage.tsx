/**
 * Camera Capture — fullscreen overlay for Vollmer bowling display recognition.
 *
 * Two modes:
 *   calibrating — live video + draggable ROI boxes + brightness slider
 *   detecting   — live readings, throw history, auto-confirm overlay, game finish
 *
 * Confirmed throws are POSTed to the backend in real-time, which broadcasts
 * an SSE event so all connected clients see live throw progress.
 *
 * Calibration is persisted in localStorage. Uses existing api.finishGame().
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {buildTurnOrder} from '@/lib/turnOrder.ts'
import type {EveningPlayer, Game} from '@/types.ts'
import {
    CalibrationData,
    DEFAULT_CALIBRATION,
    FrameReading,
    LampROI,
    PIN_POSITIONS,
    readFrame,
} from '@/lib/cameraEngine.ts'

const STORAGE_KEY = 'kce_camera_cal_v2'
const CONFIRM_SECONDS = 5

type Mode = 'calibrating' | 'detecting' | 'kiosk'
type RoiField = 'displayLeft' | 'displayMiddle' | 'displayRight' | 'pinArea' | 'lampRed' | 'lampGreen'

interface ThrowEntry {
    throwNum: number
    pins: number
    cumulative: number | null
    pinStates: boolean[]
    playerId: number | null
}

interface DragState {
    field: RoiField
    handle: 'move' | 'nw' | 'se'
    ptrX: number
    ptrY: number
    startX: number
    startY: number
    startW: number
    startH: number
}

interface Props {
    onClose: () => void
}

const ROI_COLORS: Record<RoiField, string> = {
    displayLeft: '#f59e0b',
    displayMiddle: '#10b981',
    displayRight: '#3b82f6',
    pinArea: '#a78bfa',
    lampRed: '#ef4444',
    lampGreen: '#22c55e',
}

function loadCalibration(): CalibrationData {
    try {
        const s = localStorage.getItem(STORAGE_KEY)
        if (s) {
            const p = JSON.parse(s)
            if (p.version === 2) return p as CalibrationData
        }
    } catch {}
    return DEFAULT_CALIBRATION
}

export function CameraCapturePage({onClose}: Props) {
    const t = useT()
    const {evening, invalidate} = useActiveEvening()
    const user = useAppStore(s => s.user)

    // DOM refs
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const videoContainerRef = useRef<HTMLDivElement>(null)
    const rafRef = useRef<number>(0)
    const dragRef = useRef<DragState | null>(null)

    // SVG overlay inset (tracks actual video bounds within container to avoid distortion)
    const [svgInset, setSvgInset] = useState<{left: number; top: number; width: string; height: string}>(
        {left: 0, top: 0, width: '100%', height: '100%'}
    )

    // Refs for RAF loop and callbacks (avoid stale closures)
    const calRef = useRef<CalibrationData>(DEFAULT_CALIBRATION)
    const pendingRef = useRef<FrameReading | null>(null)
    const lastThrowNumRef = useRef<number | null>(null)
    const selectedGameIdRef = useRef<number | null>(null)
    const activePlayerIdRef = useRef<number | null>(null)
    const eveningIdRef = useRef<number | null>(null)
    // Kiosk turn order refs (accessible inside RAF loop)
    const kioskTurnOrderRef = useRef<EveningPlayer[]>([])
    const kioskTurnIdxRef = useRef<number>(0)

    // UI state
    const [mode, setMode] = useState<Mode>('detecting')
    const [cameraError, setCameraError] = useState<string | null>(null)
    const [videoReady, setVideoReady] = useState(false)

    // Calibration
    const [calibration, setCalibration] = useState<CalibrationData>(loadCalibration)

    // Detection
    const [currentReading, setCurrentReading] = useState<FrameReading | null>(null)
    const [pendingThrow, setPendingThrow] = useState<FrameReading | null>(null)
    const [countdown, setCountdown] = useState(CONFIRM_SECONDS)
    const [throws, setThrows] = useState<ThrowEntry[]>([])

    // Game finish
    const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
    const [winnerRef, setWinnerRef] = useState('')
    const [saving, setSaving] = useState(false)

    // Test-throw mode (no camera needed)
    const [testMode, setTestMode] = useState(false)
    const [testPins, setTestPins] = useState(9)
    const [testCumulative, setTestCumulative] = useState<number | null>(null)
    const [testSubmitting, setTestSubmitting] = useState(false)
    const [testThrowNum, setTestThrowNum] = useState(1)
    const [testPlayerId, setTestPlayerId] = useState<number | null>(null)

    // Kiosk turn-order tracking (mirrors tablet logic for standalone kiosk use)
    const [kioskTurnIdx, setKioskTurnIdx] = useState(0)
    const [kioskBlockTeamIdx] = useState(0)  // block mode unsupported in standalone kiosk

    // Auto-select the running/open game from the evening (same logic as tablet manager)
    const activeGame = evening?.games.find(g => (g.status === 'running' || g.status === 'open') && !(g as any).is_deleted) ?? null
    useEffect(() => {
        if (activeGame && selectedGameId !== activeGame.id) {
            setSelectedGameId(activeGame.id)
            setWinnerRef('')
            setThrows([])
            // Sync turn index to server state (mirrors tablet logic) so re-opening mid-game is correct
            setKioskTurnIdx(activeGame.throws?.length ?? 0)
        }
    }, [activeGame?.id])

    // Turn order for kiosk (same logic as tablet)
    const players = evening?.players ?? []
    const teams = evening?.teams ?? []
    const kioskTurnOrder = useMemo(() =>
        buildTurnOrder(players, teams, activeGame?.turn_mode ?? 'alternating', kioskBlockTeamIdx),
        [players, teams, activeGame?.turn_mode, kioskBlockTeamIdx])
    const kioskCurrentPlayer: EveningPlayer | null = kioskTurnOrder.length > 0
        ? kioskTurnOrder[kioskTurnIdx % kioskTurnOrder.length]
        : null

    // Keep refs in sync
    useEffect(() => { calRef.current = calibration }, [calibration])
    useEffect(() => { selectedGameIdRef.current = selectedGameId }, [selectedGameId])
    useEffect(() => { eveningIdRef.current = evening?.id ?? null }, [evening?.id])
    // Kiosk turn order refs (accessible inside RAF loop without stale closure)
    useEffect(() => { kioskTurnOrderRef.current = kioskTurnOrder }, [kioskTurnOrder])
    useEffect(() => { kioskTurnIdxRef.current = kioskTurnIdx }, [kioskTurnIdx])
    // Active player: kiosk locally-tracked player takes priority over tablet-set player
    useEffect(() => {
        activePlayerIdRef.current = kioskCurrentPlayer?.id ?? activeGame?.active_player_id ?? null
    }, [kioskCurrentPlayer?.id, activeGame?.active_player_id])
    // Kiosk: proactively sync active player to backend whenever the turn changes,
    // so the backend knows who is throwing before the first throw arrives.
    useEffect(() => {
        if (mode !== 'kiosk' || !activeGame || activeGame.status !== 'running' || !evening) return
        const pid = kioskCurrentPlayer?.id ?? null
        if (pid !== null) api.setActivePlayer(evening.id, activeGame.id, pid).catch(() => {})
    }, [mode, kioskCurrentPlayer?.id, activeGame?.id, activeGame?.status])

    // Track actual video render bounds within the container to avoid SVG overlay distortion.
    // objectFit:contain adds letterboxing — SVG must match the video area, not the container.
    useEffect(() => {
        if (!videoReady) return
        function recompute() {
            const v = videoRef.current
            const c = videoContainerRef.current
            if (!v || !c || !v.videoWidth || !c.clientWidth || !c.clientHeight) return
            const vr = v.videoWidth / v.videoHeight
            const cr = c.clientWidth / c.clientHeight
            if (cr > vr) {
                // letterbox left + right
                const w = c.clientHeight * vr
                setSvgInset({left: (c.clientWidth - w) / 2, top: 0, width: w + 'px', height: '100%'})
            } else {
                // letterbox top + bottom
                const h = c.clientWidth / vr
                setSvgInset({left: 0, top: (c.clientHeight - h) / 2, width: '100%', height: h + 'px'})
            }
        }
        recompute()
        const ro = new ResizeObserver(recompute)
        if (videoContainerRef.current) ro.observe(videoContainerRef.current)
        return () => ro.disconnect()
    }, [videoReady])

    // Start camera on mount
    useEffect(() => {
        let stream: MediaStream | null = null
        navigator.mediaDevices
            .getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}}})
            .then(s => {
                stream = s
                if (videoRef.current) {
                    videoRef.current.srcObject = s
                    videoRef.current.play()
                }
            })
            .catch(e => setCameraError(e.message ?? String(e)))
        return () => stream?.getTracks().forEach(t => t.stop())
    }, [])

    // RAF analysis loop — runs in both detecting and kiosk modes
    useEffect(() => {
        if (mode !== 'detecting' && mode !== 'kiosk') return
        const isKiosk = mode === 'kiosk'

        const loop = () => {
            const video = videoRef.current
            const canvas = canvasRef.current
            if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
                if (canvas.width !== video.videoWidth) {
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                }
                const ctx = canvas.getContext('2d', {willReadFrequently: true})!
                ctx.drawImage(video, 0, 0)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const reading = readFrame(imageData, calRef.current)
                setCurrentReading({...reading})

                if (
                    reading.throwNum !== null &&
                    reading.throwNum !== lastThrowNumRef.current &&
                    pendingRef.current === null &&
                    reading.throwPins !== null
                ) {
                    lastThrowNumRef.current = reading.throwNum
                    if (isKiosk && selectedGameIdRef.current !== null) {
                        // Kiosk: immediate submission, no confirmation overlay; skip if no active game
                        const r = reading
                        const gid = selectedGameIdRef.current
                        const eid = eveningIdRef.current
                        // Capture current player before advancing turn
                        const currentPid = activePlayerIdRef.current
                        // Advance turn so the ref already reflects the next player
                        const order = kioskTurnOrderRef.current
                        if (order.length > 0) {
                            const nextIdx = kioskTurnIdxRef.current + 1
                            kioskTurnIdxRef.current = nextIdx
                            setKioskTurnIdx(nextIdx)
                            const nextPid = order[nextIdx % order.length]?.id ?? null
                            activePlayerIdRef.current = nextPid
                            if (nextPid !== null && eid) {
                                api.setActivePlayer(eid, gid, nextPid).catch(() => {})
                            }
                        }
                        setThrows(prev => {
                            const entry: ThrowEntry = {
                                throwNum: r.throwNum!, pins: r.throwPins!,
                                cumulative: r.cumulative, pinStates: r.pinStates,
                                playerId: currentPid,
                            }
                            const idx = prev.findIndex(t => t.throwNum === entry.throwNum)
                            if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next }
                            return [...prev, entry]
                        })
                        if (eid) {
                            api.addCameraThrow(eid, gid, {
                                throw_num: r.throwNum!, pins: r.throwPins!,
                                cumulative: r.cumulative ?? undefined,
                                pin_states: r.pinStates,
                                player_id: currentPid,
                            }).catch(() => {})
                        }
                    } else if (!isKiosk && selectedGameIdRef.current !== null) {
                        // Detecting mode: only queue for confirmation when a game is active
                        pendingRef.current = reading
                        setPendingThrow({...reading})
                    }
                }
            }
            rafRef.current = requestAnimationFrame(loop)
        }

        rafRef.current = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(rafRef.current)
    }, [mode])

    // 5s countdown auto-confirm
    useEffect(() => {
        if (!pendingThrow) return
        setCountdown(CONFIRM_SECONDS)
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval)
                    _doConfirm(pendingRef.current)
                    return CONFIRM_SECONDS
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(interval)
    }, [pendingThrow])

    // Submit a confirmed throw: add to local list + POST to backend
    function _doConfirm(r: FrameReading | null) {
        if (r && r.throwPins !== null && r.throwNum !== null) {
            const gid = selectedGameIdRef.current
            const eid = eveningIdRef.current
            // Capture current player BEFORE advancing turn
            const currentPid = activePlayerIdRef.current
            const entry: ThrowEntry = {
                throwNum: r.throwNum,
                pins: r.throwPins,
                cumulative: r.cumulative,
                pinStates: r.pinStates,
                playerId: currentPid,
            }
            setThrows(prev => {
                // Upsert by throwNum
                const idx = prev.findIndex(t => t.throwNum === entry.throwNum)
                if (idx >= 0) {
                    const next = [...prev]
                    next[idx] = entry
                    return next
                }
                return [...prev, entry]
            })
            if (gid && eid) {
                // Advance turn (mirrors kiosk RAF loop and handleTestThrow)
                const order = kioskTurnOrderRef.current
                if (order.length > 0) {
                    const nextIdx = kioskTurnIdxRef.current + 1
                    kioskTurnIdxRef.current = nextIdx
                    setKioskTurnIdx(nextIdx)
                    const nextPid = order[nextIdx % order.length]?.id ?? null
                    activePlayerIdRef.current = nextPid
                    if (nextPid !== null) {
                        api.setActivePlayer(eid, gid, nextPid).catch(() => {})
                    }
                }
                api.addCameraThrow(eid, gid, {
                    throw_num: r.throwNum,
                    pins: r.throwPins,
                    cumulative: r.cumulative ?? undefined,
                    pin_states: r.pinStates,
                    player_id: currentPid,
                }).catch(() => {}) // silent — local state is the source of truth
            }
        }
        pendingRef.current = null
        setPendingThrow(null)
    }

    function confirmThrow() { _doConfirm(pendingRef.current) }
    function dismissThrow() {
        pendingRef.current = null
        setPendingThrow(null)
    }

    function saveCalibration() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
        setMode('detecting')
    }

    // ── ROI drag ─────────────────────────────────────────────────────────────

    function getSvgCoords(e: React.PointerEvent): [number, number] {
        const svg = svgRef.current!
        const rect = svg.getBoundingClientRect()
        // rect matches actual video area (SVG is now sized/positioned to the video, not the container)
        return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
    }

    function startDrag(e: React.PointerEvent, field: RoiField, handle: DragState['handle']) {
        e.stopPropagation()
        svgRef.current!.setPointerCapture(e.pointerId)
        const [px, py] = getSvgCoords(e)
        const roi = calibration[field]
        dragRef.current = {field, handle, ptrX: px, ptrY: py, startX: roi.x, startY: roi.y, startW: roi.w, startH: roi.h}
    }

    const onSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
        const drag = dragRef.current
        if (!drag) return
        const [px, py] = getSvgCoords(e)
        const dx = px - drag.ptrX
        const dy = py - drag.ptrY
        const MIN = 0.04
        setCalibration(prev => {
            const roi = {...prev[drag.field]} as {x: number; y: number; w: number; h: number; digits?: 1 | 2 | 3; version?: 1}
            if (drag.handle === 'move') {
                roi.x = Math.max(0, Math.min(1 - roi.w, drag.startX + dx))
                roi.y = Math.max(0, Math.min(1 - roi.h, drag.startY + dy))
            } else if (drag.handle === 'se') {
                roi.w = Math.max(MIN, drag.startW + dx)
                roi.h = Math.max(MIN, drag.startH + dy)
            } else {
                const nw = Math.max(MIN, drag.startW - dx)
                const nh = Math.max(MIN, drag.startH - dy)
                roi.x = drag.startX + drag.startW - nw
                roi.y = drag.startY + drag.startH - nh
                roi.w = nw
                roi.h = nh
            }
            return {...prev, [drag.field]: roi}
        })
    }, [])

    const onSvgPointerUp = useCallback(() => { dragRef.current = null }, [])

    // ── Test-throw submission ─────────────────────────────────────────────────

    async function handleTestThrow() {
        const gid = selectedGameId
        const eid = evening?.id ?? null
        if (!gid || !eid || testSubmitting) return
        setTestSubmitting(true)
        try {
            // Player: explicit selection takes priority, then kiosk turn order, then tablet-set player
            const effectivePlayerId = testPlayerId ?? kioskCurrentPlayer?.id ?? activeGame?.active_player_id ?? null
            const entry: ThrowEntry = {
                throwNum: testThrowNum,
                pins: testPins,
                cumulative: testCumulative,
                pinStates: Array(9).fill(false),
                playerId: effectivePlayerId,
            }
            setThrows(prev => {
                const idx = prev.findIndex(t => t.throwNum === entry.throwNum)
                if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next }
                return [...prev, entry]
            })
            await api.addCameraThrow(eid, gid, {
                throw_num: testThrowNum,
                pins: testPins,
                cumulative: testCumulative ?? undefined,
                pin_states: Array(9).fill(false),
                player_id: effectivePlayerId,
            })
            setTestThrowNum(prev => prev + 1)
            // Advance kiosk turn (mirrors kiosk RAF loop — no explicit test player selected)
            if (testPlayerId === null) {
                const order = kioskTurnOrderRef.current
                if (order.length > 0) {
                    const nextIdx = kioskTurnIdxRef.current + 1
                    kioskTurnIdxRef.current = nextIdx
                    setKioskTurnIdx(nextIdx)
                    const nextPid = order[nextIdx % order.length]?.id ?? null
                    activePlayerIdRef.current = nextPid
                    if (nextPid !== null) {
                        api.setActivePlayer(eid, gid, nextPid).catch(() => {})
                    }
                }
            }
        } catch (e) {
            toastError(e)
        } finally {
            setTestSubmitting(false)
        }
    }

    // ── Game finish ───────────────────────────────────────────────────────────

    const runningGames = evening?.games.filter(g => g.status === 'running' && !(g as any).is_deleted) ?? []
    const selectedGame = runningGames.find((g: Game) => g.id === selectedGameId) ?? null
    const latestCumulative = throws.length > 0 ? throws[throws.length - 1].cumulative : null

    function playerLabel(p: {name: string; is_king: boolean}) {
        return p.is_king ? `👑 ${p.name}` : p.name
    }

    function winnerName(ref: string): string {
        if (ref.startsWith('p:')) {
            const p = players.find(p => p.id === parseInt(ref.slice(2)))
            return p ? playerLabel(p) : ref
        }
        if (ref.startsWith('t:')) return teams.find(t => t.id === parseInt(ref.slice(2)))?.name ?? ref
        return ref
    }

    async function handleFinishGame() {
        if (!selectedGame || !winnerRef || !evening) return
        setSaving(true)
        try {
            const scores: Record<string, number> = {}
            if (latestCumulative !== null) scores[winnerRef] = latestCumulative
            await api.finishGame(evening.id, selectedGame.id, {
                winner_ref: winnerRef,
                winner_name: winnerName(winnerRef),
                scores,
                loser_penalty: selectedGame.loser_penalty,
            })
            invalidate()
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const roiLabel = (f: RoiField) => ({
        displayLeft: t('camera.displayLeft'),
        displayMiddle: t('camera.displayMiddle'),
        displayRight: t('camera.displayRight'),
        pinArea: t('camera.pinArea'),
        lampRed: t('camera.lampRed'),
        lampGreen: t('camera.lampGreen'),
    }[f])

    const fields: RoiField[] = ['displayLeft', 'displayMiddle', 'displayRight', 'pinArea', 'lampRed', 'lampGreen']

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'var(--kce-bg)',
            display: 'flex', flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top, 0px)',
        }}>
            {/* Header — hidden in kiosk mode */}
            {mode !== 'kiosk' && (
                <div style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--kce-border)',
                    background: 'var(--kce-surface)',
                }}>
                    <button onClick={onClose} style={{
                        color: 'var(--kce-muted)', fontSize: 20, lineHeight: 1,
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    }}>✕</button>
                    <span style={{fontWeight: 'bold', color: 'var(--kce-cream)', flex: 1, fontSize: 14}}>
                        📷 {t('camera.title')}
                    </span>
                    <button className="btn-secondary btn-sm"
                            onClick={() => setMode(mode === 'calibrating' ? 'detecting' : 'calibrating')}>
                        {mode === 'calibrating' ? '▶ ' + t('camera.detecting') : '⚙ ' + t('camera.calibrate')}
                    </button>
                </div>
            )}

            {/* Camera error */}
            {cameraError && (
                <div style={{padding: '10px 16px', color: '#f87171', fontSize: 12, textAlign: 'center'}}>
                    ⚠️ {t('camera.noCamera')}<br/>
                    <span style={{opacity: 0.7, fontSize: 11}}>{cameraError}</span>
                </div>
            )}

            {/* Video + SVG overlay */}
            <div ref={videoContainerRef} style={{
                position: 'relative', background: '#000',
                ...(mode === 'kiosk'
                    ? {flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}
                    : {flexShrink: 0, maxHeight: '45vh', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center'}
                ),
            }}>
                <video ref={videoRef} muted playsInline
                       style={{width: '100%', height: '100%', objectFit: 'contain', display: 'block'}}
                       onLoadedMetadata={() => setVideoReady(true)}/>
                <canvas ref={canvasRef} style={{display: 'none'}}/>

                {videoReady && (
                    <svg ref={svgRef} viewBox="0 0 1 1" preserveAspectRatio="none"
                         style={{
                             position: 'absolute',
                             left: svgInset.left, top: svgInset.top,
                             width: svgInset.width, height: svgInset.height,
                             overflow: 'visible',
                         }}
                         onPointerMove={onSvgPointerMove} onPointerUp={onSvgPointerUp}>
                        {fields.map(field => {
                            const roi = calibration[field] as {x: number; y: number; w: number; h: number; digits?: number}
                            const color = ROI_COLORS[field]
                            const isPin = field === 'pinArea'
                            const isLamp = field === 'lampRed' || field === 'lampGreen'
                            const digits = (isPin || isLamp) ? 0 : (roi.digits ?? 1)
                            const lampLit = isLamp && currentReading
                                ? (field === 'lampRed' ? currentReading.lampRed : currentReading.lampGreen)
                                : false
                            return (
                                <g key={field}>
                                    <rect x={roi.x} y={roi.y} width={roi.w} height={roi.h}
                                          fill={lampLit ? (field === 'lampRed' ? 'rgba(239,68,68,0.35)' : 'rgba(34,197,94,0.35)') : 'rgba(0,0,0,0.08)'}
                                          stroke={color} strokeWidth="0.003"
                                          style={{cursor: 'move'}}
                                          onPointerDown={e => startDrag(e as any, field, 'move')}/>
                                    <text x={roi.x + 0.005} y={roi.y + roi.h + 0.025}
                                          fill={color} fontSize="0.022" fontFamily="monospace">
                                        {roiLabel(field)}
                                    </text>
                                    {!isPin && !isLamp && currentReading && mode === 'detecting' && (
                                        <text x={roi.x + roi.w / 2} y={roi.y + roi.h / 2 + 0.01}
                                              fill={color} fontSize="0.05" fontFamily="monospace"
                                              textAnchor="middle" dominantBaseline="middle"
                                              style={{pointerEvents: 'none'}}>
                                            {field === 'displayLeft' ? (currentReading.throwNum ?? '?') :
                                                field === 'displayMiddle' ? (currentReading.throwPins ?? '?') :
                                                    (currentReading.cumulative ?? '?')}
                                        </text>
                                    )}
                                    {!isPin && !isLamp && digits > 1 && Array.from({length: digits - 1}, (_, d) => {
                                        const x = roi.x + (d + 1) * (roi.w / digits)
                                        return <line key={d} x1={x} y1={roi.y} x2={x} y2={roi.y + roi.h}
                                                     stroke={color} strokeWidth="0.001" strokeDasharray="0.005 0.003"/>
                                    })}
                                    {isPin && PIN_POSITIONS.map(([px, py], i) => {
                                        const cx = roi.x + px * roi.w
                                        const cy = roi.y + py * roi.h
                                        const fallen = currentReading?.pinStates[i] ?? false
                                        return <circle key={i} cx={cx} cy={cy} r="0.014"
                                                       fill={fallen ? '#fff' : 'transparent'}
                                                       stroke={fallen ? '#fff' : color} strokeWidth="0.002"
                                                       style={{pointerEvents: 'none'}}/>
                                    })}
                                    <circle cx={roi.x} cy={roi.y} r="0.014"
                                            fill={color} stroke="var(--kce-bg)" strokeWidth="0.003"
                                            style={{cursor: 'nw-resize'}}
                                            onPointerDown={e => startDrag(e as any, field, 'nw')}/>
                                    <circle cx={roi.x + roi.w} cy={roi.y + roi.h} r="0.014"
                                            fill={color} stroke="var(--kce-bg)" strokeWidth="0.003"
                                            style={{cursor: 'se-resize'}}
                                            onPointerDown={e => startDrag(e as any, field, 'se')}/>
                                </g>
                            )
                        })}
                    </svg>
                )}

                {/* Kiosk status overlay — shown inside video area when in kiosk mode */}
                {mode === 'kiosk' && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
                        background: 'rgba(0,0,0,0.75)',
                        padding: '8px 12px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        borderTop: '1px solid rgba(255,255,255,0.15)',
                    }}>
                        <span style={{fontSize: 11, color: '#4ade80', fontWeight: 'bold', flexShrink: 0}}>
                            📷 {t('camera.kiosk')}
                        </span>
                        {selectedGame && (
                            <span style={{fontSize: 12, color: 'var(--kce-amber)', fontWeight: 'bold', flexShrink: 0}}>
                                {selectedGame.name}
                            </span>
                        )}
                        {/* Active player — prefer local kiosk turn order */}
                        {(kioskCurrentPlayer ?? players.find(p => p.id === activeGame?.active_player_id)) && (
                            <span style={{fontSize: 12, color: 'var(--kce-primary)', fontWeight: 'bold', flexShrink: 0}}>
                                🎳 {(kioskCurrentPlayer ?? players.find(p => p.id === activeGame?.active_player_id))!.name}
                            </span>
                        )}
                        {currentReading?.throwNum !== null && currentReading?.throwNum !== undefined && (
                            <span style={{fontSize: 11, color: 'var(--kce-cream)', fontFamily: 'monospace'}}>
                                W#{currentReading.throwNum}
                                {currentReading.throwPins !== null && ` · ${currentReading.throwPins}`}
                            </span>
                        )}
                        {/* Lamp indicators */}
                        {currentReading?.lampGreen && (
                            <span style={{fontSize: 11, color: '#4ade80', flexShrink: 0}}>🟢</span>
                        )}
                        {currentReading?.lampRed && (
                            <span style={{fontSize: 11, color: '#f87171', flexShrink: 0}}>🔴 {t('camera.lampRedHint')}</span>
                        )}
                        <span style={{fontSize: 11, color: 'var(--kce-muted)', marginLeft: 'auto'}}>
                            {throws.length} {t('camera.throw').toLowerCase()}s ✓
                        </span>
                        <button
                            className="btn-secondary btn-xs"
                            style={{flexShrink: 0}}
                            onClick={() => setMode('detecting')}
                        >
                            {t('camera.exitKiosk')}
                        </button>
                    </div>
                )}
            </div>

            {/* Scrollable content — hidden in kiosk mode */}
            <div style={{flex: 1, overflowY: 'auto', padding: '8px 12px 24px', display: mode === 'kiosk' ? 'none' : 'block'}}>

                {/* ── CALIBRATION MODE ── */}
                {mode === 'calibrating' && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4}}>
                        <p style={{color: 'var(--kce-muted)', fontSize: 12, margin: 0}}>{t('camera.calibrateHint')}</p>
                        {(['displayLeft', 'displayMiddle', 'displayRight'] as const).map(field => (
                            <div key={field} style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                                <span style={{color: ROI_COLORS[field], fontSize: 12, flex: 1, minWidth: 80}}>
                                    {roiLabel(field)}
                                </span>
                                <span style={{color: 'var(--kce-muted)', fontSize: 11}}>{t('camera.digits')}:</span>
                                {([1, 2, 3] as const).map(n => (
                                    <button key={n} type="button"
                                            className={`chip ${calibration[field].digits === n ? 'active' : ''}`}
                                            onClick={() => setCalibration(prev => ({
                                                ...prev, [field]: {...prev[field], digits: n},
                                            }))}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        ))}
                        <div>
                            <label style={{color: 'var(--kce-cream)', fontSize: 12, display: 'block', marginBottom: 4}}>
                                {t('camera.brightness')}: <strong>{calibration.brightness}</strong>
                            </label>
                            <input type="range" min="10" max="200" step="5"
                                   value={calibration.brightness}
                                   onChange={e => setCalibration(prev => ({...prev, brightness: parseInt(e.target.value)}))}
                                   style={{width: '100%'}}/>
                        </div>
                        <div>
                            <label style={{color: '#ef4444', fontSize: 12, display: 'block', marginBottom: 4}}>
                                {t('camera.redness')}: <strong>{calibration.redness ?? 80}</strong>
                            </label>
                            <input type="range" min="10" max="200" step="5"
                                   value={calibration.redness ?? 80}
                                   onChange={e => setCalibration(prev => ({...prev, redness: parseInt(e.target.value)}))}
                                   style={{width: '100%'}}/>
                        </div>
                        <div style={{display: 'flex', gap: 8}}>
                            <button className="btn-primary" style={{flex: 1}} onClick={saveCalibration}>
                                💾 {t('camera.saveCalibration')}
                            </button>
                            <button className="btn-secondary" title={t('camera.resetCalibration')}
                                    onClick={() => setCalibration({...DEFAULT_CALIBRATION})}>↩</button>
                        </div>
                    </div>
                )}

                {/* ── DETECTION MODE ── */}
                {mode === 'detecting' && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4}}>

                        {/* 1. Game selector (top — required for backend sync) */}
                        {isAdmin(user) && (
                            <div style={{
                                padding: '8px 10px', borderRadius: 10,
                                border: `1px solid ${selectedGame ? 'var(--kce-primary)' : 'var(--kce-border)'}`,
                                background: selectedGame
                                    ? 'color-mix(in srgb, var(--kce-primary) 10%, transparent)'
                                    : 'var(--kce-surface)',
                            }}>
                                <div className="field-label" style={{marginBottom: 6}}>{t('camera.selectGame')}</div>
                                {runningGames.length === 0
                                    ? <p style={{color: 'var(--kce-muted)', fontSize: 12, margin: 0}}>{t('camera.noRunningGame')}</p>
                                    : <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                                        {runningGames.map((g: Game) => (
                                            <button key={g.id} type="button"
                                                    className={`chip ${selectedGameId === g.id ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setSelectedGameId(g.id)
                                                        setWinnerRef('')
                                                        setThrows([])
                                                    }}>
                                                {g.name}
                                            </button>
                                        ))}
                                    </div>
                                }
                                {selectedGame && (
                                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginTop: 6}}>
                                        <p style={{fontSize: 10, color: 'var(--kce-primary)', margin: 0, fontWeight: 'bold', flex: 1}}>
                                            ✓ {t('camera.syncActive')}
                                        </p>
                                        <button
                                            className="btn-primary btn-xs"
                                            onClick={() => setMode('kiosk')}
                                        >
                                            📷 {t('camera.enterKiosk')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 1b. Active player + lamp status */}
                        <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                            {(kioskCurrentPlayer ?? players.find(pl => pl.id === activeGame?.active_player_id)) && (
                                <span style={{
                                    fontSize: 12, fontWeight: 'bold',
                                    color: '#fff', background: 'var(--kce-primary)',
                                    borderRadius: 8, padding: '3px 8px', flexShrink: 0,
                                }}>
                                    🎳 {(kioskCurrentPlayer ?? players.find(pl => pl.id === activeGame?.active_player_id))!.name}
                                </span>
                            )}
                            {currentReading?.lampGreen && (
                                <span style={{
                                    fontSize: 11, color: '#4ade80', fontWeight: 'bold',
                                    background: 'rgba(34,197,94,0.15)',
                                    border: '1px solid rgba(34,197,94,0.4)',
                                    borderRadius: 6, padding: '2px 8px',
                                }}>
                                    🟢 {t('camera.lampGreenHint')}
                                </span>
                            )}
                            {currentReading?.lampRed && (
                                <span style={{
                                    fontSize: 11, color: '#f87171', fontWeight: 'bold',
                                    background: 'rgba(239,68,68,0.15)',
                                    border: '1px solid rgba(239,68,68,0.4)',
                                    borderRadius: 6, padding: '2px 8px',
                                }}>
                                    🔴 {t('camera.lampRedHint')}
                                </span>
                            )}
                        </div>

                        {/* 2. Live readings */}
                        {currentReading && (
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6}}>
                                {(
                                    [
                                        ['camera.displayLeft', currentReading.throwNum, 'displayLeft'],
                                        ['camera.displayMiddle', currentReading.throwPins, 'displayMiddle'],
                                        ['camera.displayRight', currentReading.cumulative, 'displayRight'],
                                    ] as const
                                ).map(([key, val, field]) => (
                                    <div key={field} className="kce-card p-2 text-center">
                                        <div style={{fontSize: 9, color: ROI_COLORS[field as RoiField], marginBottom: 2, fontWeight: 'bold'}}>
                                            {t(key as any)}
                                        </div>
                                        <div style={{
                                            fontSize: 26, fontFamily: 'monospace', fontWeight: 'bold',
                                            color: val !== null ? 'var(--kce-cream)' : 'var(--kce-muted)', lineHeight: 1,
                                        }}>
                                            {val ?? '—'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 3. Pin diamond */}
                        {currentReading && (
                            <div style={{position: 'relative', width: 110, height: 90, margin: '0 auto', flexShrink: 0}}>
                                {PIN_POSITIONS.map(([px, py], i) => (
                                    <div key={i} style={{
                                        position: 'absolute',
                                        left: `${px * 100}%`, top: `${py * 100}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: 18, height: 18, borderRadius: '50%',
                                        background: currentReading.pinStates[i] ? '#e5e7eb' : 'transparent',
                                        border: `2px solid ${currentReading.pinStates[i] ? '#e5e7eb' : '#555'}`,
                                        transition: 'background 0.15s, border-color 0.15s',
                                    }}/>
                                ))}
                            </div>
                        )}

                        {/* 4. Throw history */}
                        <div>
                            <div className="sec-heading" style={{fontSize: 11, marginBottom: 4}}>
                                {t('camera.throwHistory')}
                            </div>
                            {throws.length === 0
                                ? <p style={{color: 'var(--kce-muted)', fontSize: 12}}>{t('camera.noThrows')}</p>
                                : (
                                    <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                                        {throws.map((th, i) => {
                                            const thrower = players.find(p => p.id === th.playerId)
                                            return (
                                                <div key={i} className="kce-card p-2 flex items-center gap-2">
                                                    <span style={{color: 'var(--kce-muted)', fontSize: 11, minWidth: 44}}>
                                                        {t('camera.throw')} #{th.throwNum}
                                                    </span>
                                                    {thrower && (
                                                        <span style={{fontSize: 10, color: 'var(--kce-primary)', fontWeight: 'bold', flexShrink: 0}}>
                                                            {thrower.name}
                                                        </span>
                                                    )}
                                                    <span style={{fontFamily: 'monospace', fontWeight: 'bold', fontSize: 18, color: 'var(--kce-amber)'}}>
                                                        {th.pins}
                                                    </span>
                                                    <span style={{color: 'var(--kce-muted)', fontSize: 11}}>
                                                        {t('camera.pins')}
                                                    </span>
                                                    {th.cumulative !== null && (
                                                        <span style={{color: 'var(--kce-muted)', fontSize: 11, marginLeft: 'auto'}}>
                                                            Σ {th.cumulative}
                                                        </span>
                                                    )}
                                                    {selectedGame && (
                                                        <span style={{fontSize: 9, color: '#4ade80'}}>✓</span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                        </div>

                        {/* 5. Winner + finish (when game selected) */}
                        {isAdmin(user) && selectedGame && (
                            <div style={{
                                borderTop: '1px solid var(--kce-border)', paddingTop: 10,
                                display: 'flex', flexDirection: 'column', gap: 8,
                            }}>
                                <div className="field-label">{t('game.winner')}</div>
                                <div style={{display: 'flex', flexWrap: 'wrap', gap: 6}}>
                                    {selectedGame.winner_type === 'team' && teams.map(team => (
                                        <button key={team.id} type="button"
                                                className={`chip ${winnerRef === `t:${team.id}` ? 'active' : ''}`}
                                                onClick={() => setWinnerRef(`t:${team.id}`)}>
                                            {team.name}
                                        </button>
                                    ))}
                                    {selectedGame.winner_type !== 'team' && players.map(p => (
                                        <button key={p.id} type="button"
                                                className={`chip ${winnerRef === `p:${p.id}` ? 'active' : ''}`}
                                                onClick={() => setWinnerRef(`p:${p.id}`)}>
                                            {playerLabel(p)}
                                        </button>
                                    ))}
                                </div>
                                {latestCumulative !== null && (
                                    <p style={{fontSize: 12, color: 'var(--kce-muted)', margin: 0}}>
                                        {t('camera.detectedScore')}: <strong style={{color: 'var(--kce-cream)'}}>{latestCumulative}</strong>
                                    </p>
                                )}
                                <button className="btn-primary" onClick={handleFinishGame}
                                        disabled={saving || !winnerRef}>
                                    🏁 {t('game.finish')}
                                </button>
                            </div>
                        )}

                        {/* 6. Manual test-throw mode (no camera / lane needed) */}
                        {isAdmin(user) && selectedGame && (
                            <div style={{borderTop: '1px solid var(--kce-border)', paddingTop: 10}}>
                                <button
                                    type="button"
                                    className="btn-secondary btn-xs"
                                    onClick={() => setTestMode(p => !p)}
                                    style={{marginBottom: testMode ? 8 : 0}}
                                >
                                    🧪 {t('camera.testMode')}
                                </button>
                                {testMode && (
                                    <div style={{display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'var(--kce-surface)', borderRadius: 10, border: '1px solid var(--kce-border)'}}>
                                        <p style={{fontSize: 11, color: 'var(--kce-muted)', margin: 0}}>
                                            {t('camera.testModeHint')}
                                        </p>
                                        {/* Player selector */}
                                        {players.length > 0 && (
                                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 4}}>
                                                <span style={{fontSize: 11, color: 'var(--kce-muted)', alignSelf: 'center', flexShrink: 0}}>🎳</span>
                                                {players.map(p => (
                                                    <button key={p.id} type="button"
                                                            className={`chip ${testPlayerId === p.id ? 'active' : ''}`}
                                                            style={{fontSize: 10}}
                                                            onClick={() => setTestPlayerId(prev => prev === p.id ? null : p.id)}>
                                                        {p.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                                            <label style={{fontSize: 12, color: 'var(--kce-cream)', flexShrink: 0}}>
                                                {t('camera.throw')} #
                                            </label>
                                            <input type="number" min="1" max="99"
                                                   value={testThrowNum}
                                                   onChange={e => setTestThrowNum(Math.max(1, parseInt(e.target.value) || 1))}
                                                   style={{width: 56, fontSize: 13, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 6, background: 'var(--kce-surface2)', border: '1px solid var(--kce-border)', color: 'var(--kce-cream)'}}/>
                                            <label style={{fontSize: 12, color: 'var(--kce-cream)', flexShrink: 0}}>
                                                {t('camera.pins')}
                                            </label>
                                            <input type="number" min="0" max="9"
                                                   value={testPins}
                                                   onChange={e => setTestPins(Math.min(9, Math.max(0, parseInt(e.target.value) || 0)))}
                                                   style={{width: 48, fontSize: 13, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 6, background: 'var(--kce-surface2)', border: '1px solid var(--kce-border)', color: 'var(--kce-amber)'}}/>
                                            <label style={{fontSize: 12, color: 'var(--kce-cream)', flexShrink: 0}}>
                                                Σ
                                            </label>
                                            <input type="number" min="0" max="999"
                                                   value={testCumulative ?? ''}
                                                   placeholder="—"
                                                   onChange={e => setTestCumulative(e.target.value ? parseInt(e.target.value) : null)}
                                                   style={{width: 60, fontSize: 13, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 6, background: 'var(--kce-surface2)', border: '1px solid var(--kce-border)', color: 'var(--kce-muted)'}}/>
                                            <button
                                                type="button"
                                                className="btn-primary btn-sm"
                                                disabled={testSubmitting}
                                                onClick={handleTestThrow}
                                            >
                                                {testSubmitting ? '…' : `▶ ${t('camera.testSend')}`}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Pending throw overlay ── */}
            {pendingThrow && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        background: 'var(--kce-surface)',
                        borderRadius: 16, padding: '24px 20px',
                        maxWidth: 300, width: '90%', textAlign: 'center',
                        border: '1px solid var(--kce-border)',
                    }}>
                        <div style={{
                            fontSize: 56, fontFamily: 'monospace', fontWeight: 'bold',
                            color: 'var(--kce-amber)', lineHeight: 1, marginBottom: 4,
                        }}>
                            {pendingThrow.throwPins ?? '?'}
                        </div>
                        <div style={{fontSize: 12, color: 'var(--kce-muted)', marginBottom: 8}}>
                            {t('camera.throw')} #{pendingThrow.throwNum}
                            {pendingThrow.cumulative !== null && (
                                <> · {t('camera.cumulative')}: <strong style={{color: 'var(--kce-cream)'}}>{pendingThrow.cumulative}</strong></>
                            )}
                        </div>

                        {/* Globe validation */}
                        {pendingThrow.throwPins !== null && (() => {
                            const globeCount = pendingThrow.pinStates.filter(Boolean).length
                            const match = globeCount === pendingThrow.throwPins
                            return (
                                <div style={{fontSize: 11, color: match ? '#4ade80' : '#f87171', marginBottom: 12}}>
                                    {match
                                        ? `✓ ${t('camera.globeMatch')}`
                                        : `⚠ ${t('camera.globeMismatch')} (${t('camera.globes')}: ${globeCount}, ${t('camera.display')}: ${pendingThrow.throwPins})`}
                                </div>
                            )
                        })()}

                        <div style={{fontSize: 12, color: 'var(--kce-muted)', marginBottom: 14}}>
                            {t('camera.autoConfirm').replace('{s}', String(countdown))}
                        </div>

                        {/* Pin diamond preview */}
                        <div style={{position: 'relative', width: 80, height: 65, margin: '0 auto 16px'}}>
                            {PIN_POSITIONS.map(([px, py], i) => (
                                <div key={i} style={{
                                    position: 'absolute',
                                    left: `${px * 100}%`, top: `${py * 100}%`,
                                    transform: 'translate(-50%, -50%)',
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: pendingThrow.pinStates[i] ? '#e5e7eb' : 'transparent',
                                    border: `1.5px solid ${pendingThrow.pinStates[i] ? '#e5e7eb' : '#555'}`,
                                }}/>
                            ))}
                        </div>

                        <div style={{display: 'flex', gap: 8}}>
                            <button className="btn-secondary" style={{flex: 1}} onClick={dismissThrow}>
                                {t('action.cancel')}
                            </button>
                            <button className="btn-primary" style={{flex: 1}} onClick={confirmThrow}>
                                ✓ {t('action.done')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
