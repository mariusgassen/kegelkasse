/**
 * 📺 TV / beamer scoreboard (#74).
 *
 * A read-only full-screen display for a TV or projector at the lane, opened with a secret-token
 * link (`/tv/<token>`) so the screen never has to be logged in. It is mounted from `main.tsx`
 * *before* <App/>, bypassing the boot/auth flow entirely — there is no session, no navigation and
 * no shell around it.
 *
 * Kiosk view, so dark-only on purpose (same family as `CameraCapturePage`): a bright page on a wall
 * in a dim club room is unreadable. The club's brand colour still comes through — the derived token
 * set (#70) is applied against a dark canvas, so everything here uses semantic tokens and stays
 * readable whatever the club configured.
 *
 * Sizing is viewport-relative (`clamp(... vw ...)`) rather than fixed px: the same page has to read
 * from across a room on a 1080p TV and on a 4K beamer.
 */
import {useEffect, useMemo, useRef, useState} from 'react'
import {useT} from '@/i18n'
import {api} from '@/api/client'
import {celebrate} from '@/lib/celebrate'
import {deriveTokens, DEFAULT_DARK_BG} from '@/lib/tokens'
import {AppLogoAnimated} from '@/components/Logo'
import {
    availablePanels,
    initialWatch,
    nextPanel,
    observe,
    type Celebration,
    type PanelId,
    type ScoreboardData,
} from '@/lib/scoreboard'

/** Slow safety-net poll. SSE delivers the interesting moments; this catches evening start/end. */
const POLL_MS = 6_000
/** How long one standings panel stays up before the rotation advances. */
const PANEL_MS = 12_000
/** How long the full-screen celebration takeover stays up. */
const CELEBRATION_MS = 6_000

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function ScoreboardPage({token}: {token: string}) {
    const t = useT()
    const [data, setData] = useState<ScoreboardData | null>(null)
    const [error, setError] = useState<'invalid' | 'network' | null>(null)
    const [panel, setPanel] = useState<PanelId | null>(null)
    const [celebration, setCelebration] = useState<Celebration | null>(null)
    const watchRef = useRef(initialWatch())

    // ── Data: poll on a slow interval, plus an SSE nudge for anything that happens between polls ──
    useEffect(() => {
        let alive = true
        let timer: ReturnType<typeof setTimeout> | undefined

        async function load() {
            try {
                const next = await api.getScoreboard(token)
                if (!alive) return
                const {watch, celebrations} = observe(watchRef.current, next)
                watchRef.current = watch
                setData(next)
                setError(null)
                if (celebrations.length > 0) setCelebration(celebrations[celebrations.length - 1])
            } catch (e) {
                if (!alive) return
                setError(e instanceof Error && e.message === 'invalid-token' ? 'invalid' : 'network')
            }
            if (alive) timer = setTimeout(load, POLL_MS)
        }

        load()
        return () => {
            alive = false
            if (timer) clearTimeout(timer)
        }
    }, [token])

    // The SSE stream is bound server-side to the evening that was running when it connected, so it
    // is re-opened whenever the evening changes. A message just triggers an immediate refetch —
    // the payload always comes from the one endpoint.
    const eveningId = data?.evening?.id ?? null
    const ready = data !== null
    useEffect(() => {
        if (!ready || typeof EventSource === 'undefined') return
        const es = new EventSource(`/api/v1/scoreboard/${encodeURIComponent(token)}/events`)
        es.onmessage = () => {
            api.getScoreboard(token).then(next => {
                const {watch, celebrations} = observe(watchRef.current, next)
                watchRef.current = watch
                setData(next)
                if (celebrations.length > 0) setCelebration(celebrations[celebrations.length - 1])
            }).catch(() => {})
        }
        // No reconnect logic on error: the poll above keeps the board correct either way, and a TV
        // that has been on for eight hours should not accumulate reconnect timers.
        return () => es.close()
        // `ready` keeps the stream from being opened once against an unknown evening and then
        // immediately reopened when the first payload lands.
    }, [token, eveningId, ready])

    // ── Club branding on a dark canvas ──
    useEffect(() => {
        if (!data) return
        const tokens = deriveTokens({
            primary: data.club.primary_color,
            secondary: data.club.secondary_color,
            bg: DEFAULT_DARK_BG,
        })
        for (const [name, value] of Object.entries(tokens)) {
            document.documentElement.style.setProperty(name, value)
        }
    }, [data?.club.primary_color, data?.club.secondary_color])

    // ── Rotation ──
    const panels = useMemo(() => availablePanels(data), [data])
    useEffect(() => {
        if (panels.length === 0) {
            setPanel(null)
            return
        }
        setPanel(p => (p && panels.includes(p) ? p : panels[0]))
        const id = setInterval(() => setPanel(p => nextPanel(p, panels)), PANEL_MS)
        return () => clearInterval(id)
    }, [panels.join('|')])

    // ── Celebrations ──
    useEffect(() => {
        if (!celebration) return
        celebrate(celebration.kind, t(celebration.kind === 'king' ? 'celebration.king' : 'celebration.allnine'))
        const id = setTimeout(() => setCelebration(null), CELEBRATION_MS)
        return () => clearTimeout(id)
    }, [celebration])

    const shell: React.CSSProperties = {
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--canvas)', color: 'var(--ink)',
        display: 'flex', flexDirection: 'column',
        padding: 'max(env(safe-area-inset-top, 0px), 2vh) max(env(safe-area-inset-right, 0px), 2vw)' +
            ' max(env(safe-area-inset-bottom, 0px), 2vh) max(env(safe-area-inset-left, 0px), 2vw)',
        overflow: 'hidden',
    }

    if (error === 'invalid') {
        return (
            <div style={{...shell, alignItems: 'center', justifyContent: 'center', gap: '2vh'}}>
                <div style={{fontSize: 'clamp(48px, 8vw, 140px)'}}>📺</div>
                <div style={{fontSize: 'clamp(18px, 2.5vw, 40px)', fontWeight: 800}}>
                    {t('scoreboard.invalidToken')}
                </div>
                <div style={{fontSize: 'clamp(14px, 1.4vw, 24px)', color: 'var(--muted)'}}>
                    {t('scoreboard.invalidTokenHint')}
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div style={{...shell, alignItems: 'center', justifyContent: 'center', gap: '3vh'}}>
                <AppLogoAnimated size={96}/>
                <div style={{fontSize: 'clamp(14px, 1.6vw, 28px)', color: 'var(--muted)', fontWeight: 700}}>
                    {error === 'network' ? t('error.network') : t('error.connecting')}
                </div>
            </div>
        )
    }

    const evening = data.evening

    return (
        <div style={shell} data-testid="scoreboard">
            <Header data={data}/>

            {!evening ? (
                <Idle/>
            ) : (
                <div style={{flex: 1, minHeight: 0, display: 'flex', gap: '2vw', marginTop: '2vh'}}>
                    <div style={{flex: '1 1 62%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2vh'}}>
                        <GamePanel data={data}/>
                        <TotalsStrip data={data}/>
                    </div>
                    <div style={{flex: '1 1 38%', minWidth: 0, display: 'flex'}}>
                        <StandingsPanel data={data} panel={panel}/>
                    </div>
                </div>
            )}

            {celebration && <CelebrationOverlay celebration={celebration}/>}
        </div>
    )
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({data}: {data: ScoreboardData}) {
    const t = useT()
    const evening = data.evening
    const date = evening?.date
        ? new Date(evening.date).toLocaleDateString('de-DE', {day: '2-digit', month: 'long', year: 'numeric'})
        : null

    return (
        <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: '1.5vw',
            paddingBottom: '1.5vh', borderBottom: '1px solid var(--line)',
        }}>
            {data.club.logo_url ? (
                <img src={data.club.logo_url} alt="" style={{height: 'clamp(32px, 5vh, 88px)', width: 'auto'}}/>
            ) : (
                <div style={{fontSize: 'clamp(24px, 4vh, 64px)'}} role="img" aria-label={data.club.name}>🎳</div>
            )}
            <div style={{minWidth: 0, flex: 1}}>
                <div style={{
                    fontSize: 'clamp(18px, 2.6vw, 52px)', fontWeight: 800, lineHeight: 1.05,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {data.club.name}
                </div>
                {(date || evening?.venue) && (
                    <div style={{fontSize: 'clamp(13px, 1.3vw, 26px)', color: 'var(--muted)', fontWeight: 600}}>
                        {[date, evening?.venue].filter(Boolean).join(' · ')}
                    </div>
                )}
            </div>
            {evening?.king && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6vw',
                    padding: '0.6vh 1.2vw', borderRadius: 999,
                    background: 'var(--accent-tint)', color: 'var(--accent-tint-fg)',
                    fontSize: 'clamp(14px, 1.5vw, 30px)', fontWeight: 800, whiteSpace: 'nowrap',
                }}>
                    <span role="img" aria-label={t('scoreboard.king')}>👑</span>
                    {evening.king.name}
                </div>
            )}
        </div>
    )
}

function Idle() {
    const t = useT()
    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '2vh',
        }}>
            <div style={{fontSize: 'clamp(56px, 10vw, 200px)'}}>🎳</div>
            <div style={{fontSize: 'clamp(20px, 3vw, 60px)', fontWeight: 800}}>{t('scoreboard.idle')}</div>
            <div style={{fontSize: 'clamp(14px, 1.5vw, 28px)', color: 'var(--muted)'}}>
                {t('scoreboard.idleHint')}
            </div>
        </div>
    )
}

// ── Live game ────────────────────────────────────────────────────────────────

function GamePanel({data}: {data: ScoreboardData}) {
    const t = useT()
    const game = data.evening?.game ?? null
    const lastResult = data.evening?.last_result ?? null

    if (!game) {
        return (
            <Card grow center>
                <div style={{fontSize: 'clamp(18px, 2.4vw, 48px)', fontWeight: 800, color: 'var(--muted)'}}>
                    {t('scoreboard.noGame')}
                </div>
                {lastResult?.winner_name && (
                    <div style={{marginTop: '1.5vh', fontSize: 'clamp(15px, 1.8vw, 34px)'}}>
                        {t('scoreboard.lastGame')}: <strong>{lastResult.name}</strong> —{' '}
                        <span style={{color: 'var(--accent-fg)', fontWeight: 800}}>🏆 {lastResult.winner_name}</span>
                    </div>
                )}
            </Card>
        )
    }

    const recent = game.throws.slice(-12)

    return (
        <Card grow>
            <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1vw'}}>
                <div style={{
                    fontSize: 'clamp(16px, 1.8vw, 36px)', fontWeight: 800, color: 'var(--muted)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {game.name}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5vw', flexShrink: 0,
                    fontSize: 'clamp(13px, 1.2vw, 24px)', fontWeight: 800, color: 'var(--accent-fg)',
                }}>
                    <span style={{
                        width: '0.7em', height: '0.7em', borderRadius: 999,
                        background: 'var(--accent)', display: 'inline-block',
                    }} className="animate-pulse"/>
                    {t('live.running')}
                </div>
            </div>

            {/* Whose turn — the single biggest thing on the screen */}
            <div style={{marginTop: '2vh'}}>
                <div style={{
                    fontSize: 'clamp(13px, 1.2vw, 24px)', fontWeight: 800, color: 'var(--muted)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                    {t('live.onTurn')}
                </div>
                <div data-testid="scoreboard-active" style={{
                    fontSize: 'clamp(40px, 7vw, 160px)', fontWeight: 900, lineHeight: 1,
                    color: 'var(--accent-fg)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {game.active_player?.name ?? '—'}
                </div>
                {game.next_player && (
                    <div style={{fontSize: 'clamp(14px, 1.5vw, 30px)', color: 'var(--muted)', fontWeight: 600}}>
                        {t('live.next')}: {game.next_player.name}
                    </div>
                )}
            </div>

            {/* Throw history of the running game */}
            {data.throw_tracking && recent.length > 0 && (
                <div style={{marginTop: 'auto', paddingTop: '2vh'}}>
                    <div style={{
                        fontSize: 'clamp(13px, 1.2vw, 24px)', fontWeight: 800, color: 'var(--muted)',
                        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1vh',
                    }}>
                        {t('scoreboard.throws')}
                    </div>
                    <div style={{display: 'flex', gap: '0.6vw', flexWrap: 'wrap'}}>
                        {recent.map(th => (
                            <div key={th.id} style={{
                                minWidth: 'clamp(38px, 3.4vw, 80px)', textAlign: 'center',
                                padding: '0.6vh 0.4vw', borderRadius: 12,
                                background: th.pins >= 9 ? 'var(--accent)' : 'var(--surface-2)',
                                color: th.pins >= 9 ? 'var(--on-accent)' : 'var(--ink)',
                                fontSize: 'clamp(18px, 2vw, 44px)', fontWeight: 900, lineHeight: 1.1,
                            }}>
                                {th.pins}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Card>
    )
}

function TotalsStrip({data}: {data: ScoreboardData}) {
    const t = useT()
    const e = data.evening!
    return (
        <div style={{flexShrink: 0, display: 'flex', gap: '1vw'}}>
            <Stat label={t('live.stat.penalties')} value={fe(e.totals.penalty_euro)}/>
            <Stat label={t('live.stat.beer')} value={`🍺 ${e.drinks.beer}`}/>
            <Stat label={t('live.stat.shots')} value={`🥃 ${e.drinks.shots}`}/>
            <Stat label={t('nav.games')} value={`${e.totals.games_finished}/${e.totals.games_total}`}/>
        </div>
    )
}

function Stat({label, value}: {label: string; value: string}) {
    return (
        <div style={{
            flex: 1, minWidth: 0, background: 'var(--surface)', borderRadius: 16,
            padding: '1.2vh 1vw', textAlign: 'center',
        }}>
            <div style={{fontSize: 'clamp(18px, 2.2vw, 46px)', fontWeight: 900, lineHeight: 1.1}}>{value}</div>
            <div style={{fontSize: 'clamp(12px, 1.1vw, 22px)', color: 'var(--muted)', fontWeight: 700}}>{label}</div>
        </div>
    )
}

// ── Rotating standings ───────────────────────────────────────────────────────

function StandingsPanel({data, panel}: {data: ScoreboardData; panel: PanelId | null}) {
    const t = useT()
    const e = data.evening!

    if (!panel) {
        return (
            <Card grow center>
                <div style={{fontSize: 'clamp(15px, 1.6vw, 32px)', color: 'var(--muted)', fontWeight: 700}}>
                    {t('scoreboard.nothingYet')}
                </div>
            </Card>
        )
    }

    if (panel === 'highlight') {
        const h = e.highlight!
        return (
            <Card grow title={`✨ ${t('scoreboard.panel.highlight')}`} testId="scoreboard-panel-highlight">
                {h.media_url && (
                    <img src={h.media_url} alt=""
                         style={{
                             flex: 1, minHeight: 0, width: '100%', objectFit: 'contain',
                             borderRadius: 16, marginTop: '1vh',
                         }}/>
                )}
                {h.text && (
                    <div style={{
                        marginTop: '1.5vh', fontSize: 'clamp(16px, 1.9vw, 38px)',
                        fontWeight: 700, lineHeight: 1.25,
                    }}>
                        {h.text}
                    </div>
                )}
            </Card>
        )
    }

    const rows = panel === 'ranking'
        ? e.penalty_ranking.map(r => ({name: r.name, value: fe(r.amount)}))
        : e.drinks.per_player.map(r => ({name: r.name, value: `${r.count}`}))

    return (
        <Card grow
              title={panel === 'ranking'
                  ? `💸 ${t('scoreboard.panel.ranking')}`
                  : `🍻 ${t('scoreboard.panel.drinks')}`}
              testId={`scoreboard-panel-${panel}`}>
            <div style={{
                flex: 1, minHeight: 0, marginTop: '1vh',
                display: 'flex', flexDirection: 'column', gap: '0.8vh', overflow: 'hidden',
            }}>
                {rows.map((r, i) => (
                    <div key={r.name} style={{display: 'flex', alignItems: 'center', gap: '1vw'}}>
                        <span style={{
                            width: '2ch', textAlign: 'right', flexShrink: 0,
                            fontSize: 'clamp(15px, 1.7vw, 34px)', fontWeight: 900,
                            color: i === 0 ? 'var(--accent-fg)' : 'var(--muted)',
                        }}>
                            {i + 1}
                        </span>
                        <span style={{
                            flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: 'clamp(16px, 1.9vw, 38px)', fontWeight: 700,
                        }}>
                            {r.name}
                        </span>
                        <span style={{
                            flexShrink: 0, fontSize: 'clamp(16px, 1.9vw, 38px)', fontWeight: 900,
                            color: 'var(--accent-fg)',
                        }}>
                            {r.value}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    )
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function Card({children, grow, center, title, testId}: {
    children: React.ReactNode
    grow?: boolean
    center?: boolean
    title?: string
    testId?: string
}) {
    return (
        <div data-testid={testId} style={{
            background: 'var(--surface)', borderRadius: 20, padding: '2vh 1.6vw',
            flex: grow ? 1 : undefined, minHeight: 0, minWidth: 0, width: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: center ? 'center' : undefined,
            justifyContent: center ? 'center' : undefined,
        }}>
            {title && (
                <div style={{
                    fontSize: 'clamp(15px, 1.6vw, 32px)', fontWeight: 800, color: 'var(--muted)',
                    letterSpacing: '0.05em',
                }}>
                    {title}
                </div>
            )}
            {children}
        </div>
    )
}

function CelebrationOverlay({celebration}: {celebration: Celebration}) {
    const t = useT()
    const isKing = celebration.kind === 'king'
    return (
        <div data-testid="scoreboard-celebration" style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'var(--accent)', color: 'var(--on-accent)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '2vh',
        }}>
            <div style={{fontSize: 'clamp(72px, 16vw, 320px)', lineHeight: 1}}>{isKing ? '👑' : '9️⃣'}</div>
            <div style={{fontSize: 'clamp(28px, 5vw, 120px)', fontWeight: 900, lineHeight: 1}}>
                {isKing ? t('scoreboard.kingCrowned') : t('scoreboard.allNine')}
            </div>
            {celebration.name && (
                <div style={{fontSize: 'clamp(22px, 4vw, 96px)', fontWeight: 800}}>{celebration.name}</div>
            )}
        </div>
    )
}
