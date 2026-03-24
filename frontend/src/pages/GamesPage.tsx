import {useState} from 'react'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast'
import {parseAmount} from '@/utils/parse.ts'
import type {Game, TurnMode, WinnerType} from '@/types.ts'
import {CameraCapturePage} from '@/pages/CameraCapturePage.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fTime(iso: string) {
    return new Date(iso).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

function playerLabel(p: { name: string; is_king: boolean }) {
    return p.is_king ? `👑 ${p.name}` : p.name
}

const STATUS_COLOR: Record<string, string> = {
    open: 'bg-kce-muted',
    running: 'bg-green-400',
    finished: 'bg-kce-amber',
}

export function GamesPage() {
    const t = useT()
    const {evening, invalidate} = useActiveEvening()
    const gameTemplates = useAppStore(s => s.gameTemplates)
    const user = useAppStore(s => s.user)

    // ── Add sheet ──
    const [addSheet, setAddSheet] = useState(false)
    const [templateId, setTemplateId] = useState<number | null>(null)
    const [gameName, setGameName] = useState('')
    const [isOpener, setIsOpener] = useState(false)
    const [winnerType, setWinnerType] = useState<WinnerType>('individual')
    const [turnMode, setTurnMode] = useState<TurnMode>('alternating')
    const [loserPenalty, setLoserPenalty] = useState('0')
    const [perPointPenalty, setPerPointPenalty] = useState('0')
    const [gameNote, setGameNote] = useState('')
    const [autoAddTeams, setAutoAddTeams] = useState(true)

    // ── Finish sheet (also used for re-editing finished games) ──
    const [finishTarget, setFinishTarget] = useState<Game | null>(null)
    const [winnerRef, setWinnerRef] = useState('')
    const [scoresInput, setScoresInput] = useState<Record<string, string>>({})
    const [finishPenalty, setFinishPenalty] = useState('')


    // ── Edit metadata sheet (open/running games) ──
    const [editTarget, setEditTarget] = useState<Game | null>(null)
    const [editName, setEditName] = useState('')
    const [editIsOpener, setEditIsOpener] = useState(false)
    const [editWinnerType, setEditWinnerType] = useState<WinnerType>('individual')
    const [editTurnMode, setEditTurnMode] = useState<TurnMode>('alternating')
    const [editLoserPenalty, setEditLoserPenalty] = useState('0')
    const [editPerPointPenalty, setEditPerPointPenalty] = useState('0')
    const [editNote, setEditNote] = useState('')

    const [saving, setSaving] = useState(false)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
    const [confirmFinishGame, setConfirmFinishGame] = useState<Game | null>(null)
    const [cameraOpen, setCameraOpen] = useState(false)

    if (!evening) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">🏆 {t('nav.games')}</div>
                <Empty icon="🏆" text={t('evening.noActive')}/>
            </div>
        )
    }

    const players = evening.players
    const teams = evening.teams
    const games = [...evening.games].filter(g => !(g as any).is_deleted).sort((a, b) => a.sort_order - b.sort_order)
    const hasOpener = games.some(g => g.is_opener)
    const runningGame = games.find(g => g.status === 'running') ?? null
    // Players without a team assignment (relevant for team games)
    const unassignedPlayers = teams.length > 0 ? players.filter(p => p.team_id === null) : []

    // ── Helpers ──

    function selectTemplate(tid: number) {
        const tmpl = gameTemplates.find(t => t.id === tid)
        if (!tmpl) return
        setTemplateId(tid)
        setGameName(tmpl.name)
        setIsOpener(tmpl.is_opener && !hasOpener)
        setLoserPenalty(String(tmpl.default_loser_penalty))
        setPerPointPenalty(String(tmpl.per_point_penalty ?? 0))
        const wt = (tmpl.winner_type === 'team' || tmpl.winner_type === 'individual') ? tmpl.winner_type : 'individual'
        setWinnerType(wt)
        if (tmpl.turn_mode) setTurnMode(tmpl.turn_mode)
    }

    function openAddSheet() {
        setTemplateId(null);
        setGameName('');
        setIsOpener(false)
        setWinnerType('individual');
        setTurnMode('alternating');
        setLoserPenalty('0');
        setPerPointPenalty('0');
        setGameNote('')
        setAddSheet(true)
    }

    function openFinishSheet(game: Game) {
        setFinishTarget(game)
        setWinnerRef(game.winner_ref ?? '')
        setScoresInput(Object.fromEntries(Object.entries(game.scores ?? {}).map(([k, v]) => [k, String(v)])))
        setFinishPenalty(String(game.loser_penalty))
    }

    function openEditSheet(game: Game) {
        setEditTarget(game)
        setEditName(game.name)
        setEditIsOpener(game.is_opener)
        setEditWinnerType((game.winner_type === 'team' || game.winner_type === 'individual') ? game.winner_type : 'individual')
        setEditTurnMode(game.turn_mode ?? 'alternating')
        setEditLoserPenalty(String(game.loser_penalty))
        setEditPerPointPenalty(String(game.per_point_penalty ?? 0))
        setEditNote(game.note ?? '')
    }

    function winnerDisplayName(ref: string) {
        if (!ref) return ''
        if (ref.startsWith('p:')) {
            const p = players.find(p => p.id === parseInt(ref.slice(2)))
            return p ? playerLabel(p) : ref
        }
        if (ref.startsWith('t:')) {
            const t = teams.find(t => t.id === parseInt(ref.slice(2)))
            return t ? t.name : ref
        }
        return ref
    }

    // ── Handlers ──

    async function submitAdd() {
        if (!gameName.trim()) return
        setSaving(true)
        try {
            await api.addGame(evening!.id, {
                name: gameName.trim(),
                template_id: templateId ?? undefined,
                is_opener: isOpener,
                winner_type: winnerType,
                turn_mode: winnerType === 'team' ? turnMode : null,
                loser_penalty: parseAmount(loserPenalty),
                per_point_penalty: parseAmount(perPointPenalty),
                note: gameNote.trim() || undefined,
                sort_order: games.length,
                client_timestamp: Math.min(Date.now(), new Date(evening!.date).getTime()),
            })
            // Auto-add standard teams if toggled and no teams exist yet
            if (autoAddTeams && teams.length === 0) {
                try { await api.applyClubTeamsToEvening(evening!.id) } catch {}
            }
            invalidate()
            setAddSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function startGame(gid: number) {
        // If another game is already running, ask user to finish it first
        if (runningGame && runningGame.id !== gid) {
            setConfirmFinishGame(runningGame)
            return
        }
        // Block team games when players are not fully assigned
        const game = games.find(g => g.id === gid)
        if (game?.turn_mode !== null && game?.turn_mode !== undefined && unassignedPlayers.length > 0) {
            showToast(t('team.cannotStartUnassigned'), 'error')
            return
        }
        try {
            await api.startGame(evening!.id, gid)
            invalidate()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function submitFinish() {
        if (!finishTarget || !winnerRef) return
        setSaving(true)
        try {
            const scores: Record<string, number> = {}
            for (const [k, v] of Object.entries(scoresInput)) {
                if (v.trim()) scores[k] = parseFloat(v) || 0
            }
            await api.finishGame(evening!.id, finishTarget.id, {
                winner_ref: winnerRef,
                winner_name: winnerDisplayName(winnerRef),
                scores,
                loser_penalty: parseAmount(finishPenalty) || finishTarget.loser_penalty,
            })
            invalidate()
            setFinishTarget(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function submitEdit() {
        if (!editTarget) return
        setSaving(true)
        try {
            await api.updateGame(evening!.id, editTarget.id, {
                name: editName.trim() || undefined,
                is_opener: editIsOpener,
                winner_type: editWinnerType,
                turn_mode: editWinnerType === 'team' ? editTurnMode : null,
                loser_penalty: parseAmount(editLoserPenalty),
                per_point_penalty: parseAmount(editPerPointPenalty),
                note: editNote.trim() || undefined,
            })
            invalidate()
            setEditTarget(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function doDelete(gid: number) {
        try {
            await api.deleteGame(evening!.id, gid)
            invalidate()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setConfirmDeleteId(null)
        }
    }

    // ── Finish sheet: which entities can win ──
    const canPickTeam = finishTarget?.winner_type === 'team'
    const canPickPlayer = finishTarget?.winner_type === 'individual'

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">🏆 {t('nav.games')}</div>

            {/* ── Unassigned-players warning (teams exist but not all players assigned) ── */}
            {unassignedPlayers.length > 0 && (
                <div className="rounded-lg px-3 py-2 mb-3 flex items-center gap-2"
                     style={{background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.35)'}}>
                    <span className="text-xs text-amber-400 flex-1">
                        ⚠️ {unassignedPlayers.length} {t('team.playersUnassigned')}
                    </span>
                    <button className="btn-secondary btn-xs flex-shrink-0"
                            onClick={() => { window.location.hash = 'config' }}>
                        → {t('nav.evening')}
                    </button>
                </div>
            )}

            <div className="flex gap-2 mb-4">
                <button className="btn-primary flex-1" onClick={openAddSheet}>
                    + {t('game.add')}
                </button>
                {isAdmin(user) && (
                    <button className="btn-secondary" title={t('camera.title')} onClick={() => setCameraOpen(true)}>
                        📷
                    </button>
                )}
            </div>

            {games.length === 0
                ? <Empty icon="🏆" text={t('game.none')}/>
                : games.map(game => (
                    <div key={game.id} className="kce-card p-3 mb-2">
                        {/* Header row */}
                        <div className="flex items-center gap-2 mb-2">
                            <span
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLOR[game.status] ?? 'bg-kce-muted'}`}/>
                            <span className="text-sm font-bold flex-1 truncate">
                                {game.is_opener ? '👑 ' : ''}{game.name}
                            </span>
                            {game.status === 'running' && game.started_at && (
                                <span
                                    className="text-xs text-green-400 font-mono flex-shrink-0">⏱ {fTime(game.started_at)}</span>
                            )}
                            {game.status === 'finished' && game.finished_at && (
                                <span className="text-xs text-kce-muted flex-shrink-0">{fTime(game.finished_at)}</span>
                            )}
                        </div>

                        {/* Live camera throw indicator */}
                        {game.status === 'running' && game.throws && game.throws.length > 0 && (() => {
                            const last = game.throws[game.throws.length - 1]
                            return (
                                <div className="flex items-center gap-1.5 mb-2">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                          style={{background: 'color-mix(in srgb, var(--kce-primary) 15%, transparent)', color: 'var(--kce-primary)'}}>
                                        📷
                                    </span>
                                    <span className="text-xs text-kce-muted">
                                        {t('camera.throw')} #{last.throw_num} &nbsp;·&nbsp;
                                        <span className="font-bold text-kce-cream font-mono">{last.pins}</span>
                                        {' '}{t('camera.pins')}
                                        {last.cumulative !== null && (
                                            <> &nbsp;·&nbsp; Σ <span className="font-bold text-kce-cream font-mono">{last.cumulative}</span></>
                                        )}
                                    </span>
                                </div>
                            )
                        })()}

                        {/* Winner / status info */}
                        {game.status === 'finished' && game.winner_ref && (
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-kce-muted">🏆 {winnerDisplayName(game.winner_ref)}</span>
                                {game.loser_penalty > 0 && (
                                    <span className="text-xs text-red-400 ml-auto">
                                        {fe(game.loser_penalty)}{(game.per_point_penalty ?? 0) > 0 ? ` +${fe(game.per_point_penalty)}/P` : ''}
                                    </span>
                                )}
                            </div>
                        )}
                        {game.status === 'open' && (
                            <p className="text-xs text-kce-muted mb-2">{t('game.status.open')}</p>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-1 justify-end">
                            {game.status === 'open' && (
                                <button className="btn-primary btn-sm" onClick={() => startGame(game.id)}>
                                    ▶ {t('game.start')}
                                </button>
                            )}
                            {game.status === 'running' && (
                                <button className="btn-primary btn-sm" onClick={() => openFinishSheet(game)}>
                                    🏁 {t('game.finish')}
                                </button>
                            )}
                            {game.status === 'finished' && (
                                <button className="btn-secondary btn-sm" onClick={() => openFinishSheet(game)}>
                                    ✏️ {t('game.editResult')}
                                </button>
                            )}
                            {game.status !== 'finished' && (
                                <button className="btn-ghost btn-xs text-kce-muted px-2"
                                        onClick={() => openEditSheet(game)}>✏️
                                </button>
                            )}
                            {confirmDeleteId === game.id ? (
                                <div className="flex gap-1">
                                    <button className="btn-danger btn-xs" onClick={() => doDelete(game.id)}>✓</button>
                                    <button className="btn-secondary btn-xs"
                                            onClick={() => setConfirmDeleteId(null)}>✕
                                    </button>
                                </div>
                            ) : (
                                <button className="btn-danger btn-xs"
                                        onClick={() => setConfirmDeleteId(game.id)}>✕</button>
                            )}
                        </div>
                    </div>
                ))
            }

            {/* ── Add game sheet ── */}
            <Sheet open={addSheet} onClose={() => setAddSheet(false)} title={t('game.add')} onSubmit={submitAdd}>
                <div className="flex flex-col gap-3">
                    {/* Template chips */}
                    {gameTemplates.length > 0 && (
                        <div>
                            <div className="field-label">{t('game.template.select')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {gameTemplates.map(tmpl => (
                                    <button key={tmpl.id} type="button"
                                            className={`chip ${templateId === tmpl.id ? 'active' : ''}`}
                                            onClick={() => selectTemplate(tmpl.id)}>
                                        {tmpl.is_opener ? '👑 ' : ''}{tmpl.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Name */}
                    <div>
                        <label className="field-label">{t('game.name')}</label>
                        <input className="kce-input" value={gameName} onChange={e => setGameName(e.target.value)}
                               placeholder={t('game.name')}/>
                    </div>

                    {/* is_opener toggle */}
                    {hasOpener && !isOpener ? (
                        <div
                            className="text-xs text-kce-muted px-3 py-2 rounded-lg border border-kce-border opacity-50">
                            👑 {t('game.isOpener')} — {t('game.openerExists')}
                        </div>
                    ) : (
                        <button type="button"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${isOpener ? 'border-kce-amber text-kce-amber bg-kce-amber/10' : 'border-kce-border text-kce-muted'}`}
                                onClick={() => setIsOpener(v => !v)}>
                            <span>{isOpener ? '✓' : '+'}</span>
                            {t('game.isOpener')}
                        </button>
                    )}

                    {/* Winner type */}
                    <div>
                        <div className="field-label">{t('club.template.winnerType')}</div>
                        <div className="flex gap-1.5">
                            {(['individual', 'team'] as WinnerType[]).map(wt => (
                                <button key={wt} type="button"
                                        className={`chip flex-1 text-center ${winnerType === wt ? 'active' : ''}`}
                                        onClick={() => setWinnerType(wt)}>
                                    {t(`club.template.winnerType.${wt}` as any)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Turn mode — only for team games */}
                    {winnerType === 'team' && (
                        <div>
                            <div className="field-label">{t('game.turnMode')}</div>
                            <div className="flex gap-1.5">
                                {(['alternating', 'block'] as TurnMode[]).map(tm => (
                                    <button key={tm} type="button"
                                            className={`chip flex-1 text-center ${turnMode === tm ? 'active' : ''}`}
                                            onClick={() => setTurnMode(tm)}>
                                        {t(`game.turnMode.${tm}` as any)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Loser penalty */}
                    <div>
                        <label className="field-label">{t('game.loserPenalty')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={loserPenalty} onChange={e => setLoserPenalty(e.target.value)}/>
                        </div>
                        <p className="text-xs text-kce-muted mt-1">{t('game.loserNote')}</p>
                    </div>

                    {/* Per-point penalty */}
                    <div>
                        <label className="field-label">{t('game.perPointPenalty')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={perPointPenalty} onChange={e => setPerPointPenalty(e.target.value)}/>
                        </div>
                        <p className="text-xs text-kce-muted mt-1">{t('game.perPointNote')}</p>
                    </div>

                    {/* Note */}
                    <div>
                        <label className="field-label">{t('game.note')}</label>
                        <input className="kce-input" value={gameNote} onChange={e => setGameNote(e.target.value)}
                               placeholder="…"/>
                    </div>

                    {/* Auto-add teams toggle (only when no teams exist yet) */}
                    {teams.length === 0 && (
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={autoAddTeams}
                                   onChange={e => setAutoAddTeams(e.target.checked)}
                                   className="accent-amber-500"/>
                            <span className="text-xs text-kce-muted">{t('game.autoAddTeams')}</span>
                        </label>
                    )}

                    <button type="submit" className="btn-primary w-full mt-1"
                            disabled={saving || !gameName.trim()}>
                        {t('action.add')}
                    </button>
                </div>
            </Sheet>

            {/* ── Finish / re-edit game sheet ── */}
            <Sheet open={!!finishTarget} onClose={() => setFinishTarget(null)}
                   title={finishTarget?.status === 'finished' ? t('game.editResult') : t('game.finish')}
                   onSubmit={submitFinish}>
                {finishTarget && (
                    <div className="flex flex-col gap-3">
                        {/* Winner selection */}
                        <div>
                            <div className="field-label">{t('game.winner')}</div>
                            {canPickTeam && teams.length > 0 && (
                                <div className="mb-2">
                                    <div className="text-xs text-kce-muted mb-1">{t('game.winnerType.team')}</div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {teams.map(team => (
                                            <button key={`t:${team.id}`} type="button"
                                                    className={`chip ${winnerRef === `t:${team.id}` ? 'active' : ''}`}
                                                    onClick={() => setWinnerRef(`t:${team.id}`)}>
                                                {team.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {canPickPlayer && players.length > 0 && (
                                <div>
                                    {canPickTeam && <div
                                        className="text-xs text-kce-muted mb-1">{t('game.winnerType.player')}</div>}
                                    <div className="flex flex-wrap gap-1.5">
                                        {players.map(p => (
                                            <button key={`p:${p.id}`} type="button"
                                                    className={`chip ${winnerRef === `p:${p.id}` ? 'active' : ''}`}
                                                    onClick={() => setWinnerRef(`p:${p.id}`)}>
                                                {playerLabel(p)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Scores */}
                        {(players.length > 0 || teams.length > 0) && (
                            <div>
                                <div className="field-label">{t('game.scores')}</div>
                                <div className="flex flex-col gap-1.5">
                                    {finishTarget.winner_type === 'team'
                                        ? teams.map(team => (
                                            <div key={`t:${team.id}`} className="flex items-center gap-2">
                                                <span className="text-xs text-kce-cream flex-1">{team.name}</span>
                                                <input className="kce-input w-20" type="number" min="0"
                                                       value={scoresInput[`t:${team.id}`] ?? ''}
                                                       onChange={e => setScoresInput(prev => ({
                                                           ...prev,
                                                           [`t:${team.id}`]: e.target.value
                                                       }))}
                                                       placeholder="0"/>
                                            </div>
                                        ))
                                        : players.map(p => (
                                            <div key={`p:${p.id}`} className="flex items-center gap-2">
                                                <span className="text-xs text-kce-cream flex-1">{playerLabel(p)}</span>
                                                <input className="kce-input w-20" type="number" min="0"
                                                       value={scoresInput[`p:${p.id}`] ?? ''}
                                                       onChange={e => setScoresInput(prev => ({
                                                           ...prev,
                                                           [`p:${p.id}`]: e.target.value
                                                       }))}
                                                       placeholder="0"/>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        )}

                        {/* Loser penalty */}
                        <div>
                            <label className="field-label">{t('game.loserPenalty')}</label>
                            <div className="flex items-center gap-2">
                                <span
                                    className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                                <input className="kce-input flex-1" type="text" inputMode="decimal"
                                       value={finishPenalty}
                                       onChange={e => setFinishPenalty(e.target.value)}/>
                            </div>
                        </div>

                        {/* Per-point penalty preview */}
                        {finishTarget && (finishTarget.per_point_penalty ?? 0) > 0 && winnerRef && (
                            <div className="rounded-lg p-3" style={{background: 'var(--kce-surface2)'}}>
                                <div className="text-xs font-bold text-kce-muted mb-2">
                                    {t('game.perPointPreview')} (+{fe(finishTarget.per_point_penalty)}/{t('game.perPointUnit')})
                                </div>
                                {(() => {
                                    const base = parseAmount(finishPenalty)
                                    const ppp = finishTarget.per_point_penalty
                                    const wScore = parseFloat(scoresInput[winnerRef] ?? '') || 0
                                    const isTeamGame = winnerRef.startsWith('t:')
                                    const losers = players.filter(p =>
                                        `p:${p.id}` !== winnerRef &&
                                        (!p.team_id || `t:${p.team_id}` !== winnerRef)
                                    )
                                    const seen = new Set<string>()
                                    return losers.map(p => {
                                        const ref = isTeamGame && p.team_id ? `t:${p.team_id}` : `p:${p.id}`
                                        if (seen.has(ref)) return null
                                        seen.add(ref)
                                        const lScore = parseFloat(scoresInput[ref] ?? '') || 0
                                        const diff = Math.abs(wScore - lScore)
                                        const total = base + diff * ppp
                                        const label = isTeamGame && p.team_id
                                            ? teams.find(t => t.id === p.team_id)?.name ?? p.name
                                            : playerLabel(p)
                                        return (
                                            <div key={ref} className="flex justify-between text-xs py-0.5">
                                                <span className="text-kce-cream">{label}</span>
                                                <span className="text-red-400 font-bold">{fe(total)}</span>
                                            </div>
                                        )
                                    })
                                })()}
                            </div>
                        )}

                        <button type="submit" className="btn-primary w-full mt-1"
                                disabled={saving || !winnerRef}>
                            {finishTarget.status === 'finished' ? t('action.save') : t('game.finish')}
                        </button>
                    </div>
                )}
            </Sheet>

            {/* ── Camera overlay ── */}
            {cameraOpen && <CameraCapturePage onClose={() => setCameraOpen(false)}/>}

            {/* ── Confirm finish running game (triggered by starting another) ── */}
            <Sheet open={!!confirmFinishGame} onClose={() => setConfirmFinishGame(null)}
                   title={`"${confirmFinishGame?.name}" – ${t('game.mustFinishFirst')}`}
                   onSubmit={() => { openFinishSheet(confirmFinishGame!); setConfirmFinishGame(null) }}>
                <p className="text-sm text-kce-muted">{t('game.mustFinishFirstHint')}</p>
            </Sheet>

            {/* ── Edit metadata sheet (open/running games) ── */}
            <Sheet open={!!editTarget} onClose={() => setEditTarget(null)} title={t('action.edit')}
                   onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('game.name')}</label>
                        <input className="kce-input" value={editName} onChange={e => setEditName(e.target.value)}/>
                    </div>
                    {/* Opener toggle — only show if this game IS the opener, or no opener exists yet */}
                    {(editIsOpener || !hasOpener || editTarget?.is_opener) && (
                        <button type="button"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${editIsOpener ? 'border-kce-amber text-kce-amber bg-kce-amber/10' : 'border-kce-border text-kce-muted'}`}
                                onClick={() => setEditIsOpener(v => !v)}>
                            <span>{editIsOpener ? '✓' : '+'}</span>
                            {t('game.isOpener')}
                        </button>
                    )}

                    {/* Winner type */}
                    <div>
                        <div className="field-label">{t('club.template.winnerType')}</div>
                        <div className="flex gap-1.5">
                            {(['individual', 'team'] as WinnerType[]).map(wt => (
                                <button key={wt} type="button"
                                        className={`chip flex-1 text-center ${editWinnerType === wt ? 'active' : ''}`}
                                        onClick={() => setEditWinnerType(wt)}>
                                    {t(`club.template.winnerType.${wt}` as any)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Turn mode — only for team games */}
                    {editWinnerType === 'team' && (
                        <div>
                            <div className="field-label">{t('game.turnMode')}</div>
                            <div className="flex gap-1.5">
                                {(['alternating', 'block'] as TurnMode[]).map(tm => (
                                    <button key={tm} type="button"
                                            className={`chip flex-1 text-center ${editTurnMode === tm ? 'active' : ''}`}
                                            onClick={() => setEditTurnMode(tm)}>
                                        {t(`game.turnMode.${tm}` as any)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="field-label">{t('game.loserPenalty')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={editLoserPenalty} onChange={e => setEditLoserPenalty(e.target.value)}/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('game.perPointPenalty')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={editPerPointPenalty} onChange={e => setEditPerPointPenalty(e.target.value)}/>
                        </div>
                        <p className="text-xs text-kce-muted mt-1">{t('game.perPointNote')}</p>
                    </div>
                    <div>
                        <label className="field-label">{t('game.note')}</label>
                        <input className="kce-input" value={editNote} onChange={e => setEditNote(e.target.value)}
                               placeholder="…"/>
                    </div>
                    <button type="submit" className="btn-primary w-full mt-1"
                            disabled={saving}>{t('action.save')}
                    </button>
                </div>
            </Sheet>

        </div>
    )
}
