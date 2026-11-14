/**
 * Dynamic-Island-style live activities (islandcn engine `lib/island` + content kit `components/islandcn`).
 *
 * Mounted once inside `<header>` (`RootLayout.tsx` owns `<EveningIsland>` with `placement="container"`
 * at `zIndex: 40`, above Quick Entry `zIndex: 30` and below `.bottom-sheet` `z-50`). Reports real
 * live/time-taking work and app-level notices:
 *   1. Running evening & active game timer (`id: 'evening'`) — compact: bowling glyph + game timer or pot;
 *      expanded: venue, running game (+ active player when throw tracking is enabled), and `MetricRow`
 *      for pot + beer/shot rounds (or a quick-start game button when no game is running yet).
 *   2. Idle status when no evening is running (`id: 'idle-status'`, `priority: -1`) — next scheduled
 *      evening with 1-tap RSVP & balance badge, personal treasury balance fallback, or schedule shortcut.
 *   3. König & Alle-Neune moments (`id: 'celebration'`, `priority: 2`, `alert: true`) — brief alerting
 *      takeover when `celebrate()` fires.
 *   4. Quick-entry booking events (`id: 'quick-entry'`, `priority: 2`) — instant penalty, drink round,
 *      undo, and game start/finish receipts.
 *   5. Media uploads (`id: 'upload'`, `priority: 1`) — live spinner while `uploadMedia()` runs, brief
 *      check mark on completion.
 *   6. Offline queue & background sync (`id: 'offline-sync'`, `priority: 1`) — pending mutation count,
 *      category breakdown, and a "Sync now" `IslandButton` when back online.
 *   7. Incoming payment-request approvals (`id: 'payment-request-<rid>'`, `group: 'payment-requests'`) —
 *      treasurer confirm/reject actions directly from the expanded island.
 *   8. Service-worker updates & release notes (`UpdatePrompt` / `WhatsNewNotice` passed as children).
 */
import {type ReactNode, useEffect, useMemo, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {
    BowlingPinsIcon,
    Calendar03Icon,
    Cancel01Icon,
    CloudIcon,
    CrownIcon,
    Wallet01Icon,
} from '@hugeicons/core-free-icons'
import {
    api,
    flushOfflineQueue,
    type UploadStatusDetail,
} from '@/api/client.ts'

export const UPLOAD_STATUS_EVENT = 'kegelkasse:upload-status'
export const SYNC_STARTED_EVENT = 'kegelkasse:sync-started'
import {router} from '@/router'
import {useT, t as tStatic} from '@/i18n'
import {useThrowTracking} from '@/hooks/useClub.ts'
import {OPEN_PROFILE_EVENT, type OpenProfileDetail} from '@/lib/aiLinks.ts'
import {canStartGameInEvening, currentGameState, eveningTotals, nextOpenGame} from '@/lib/liveEvening.ts'
import {
    DEFAULT_UPCOMING_REMINDER_DAYS,
    deriveIdleIslandMode,
    formatEurCompact,
    formatEurFull,
    formatScheduleCompact,
    formatScheduleFull,
    todayLocalKey,
    type IdleIslandMode,
} from '@/lib/islandIdle.ts'
import {CELEBRATE_EVENT, type CelebrateDetail} from '@/lib/celebrate.ts'
import {QUICK_ENTRY_EVENT, type QuickEntryEventDetail} from '@/lib/quickEntryEvents.ts'
import {offlineQueue, groupQueuedRequests, SYNC_FLUSHED_EVENT, type QueueCategory} from '@/offlineQueue.ts'
import {useAppStore} from '@/store/app.ts'
import {useIdleIslandStore, useIslandBusyStore} from '@/store/idleIsland.ts'
import {useNotificationStore} from '@/store/notifications.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {Island, IslandProvider, useIsland, useIslandActions, type IslandMetricsOverrides} from '@/lib/island'
import {Glyph} from '@/components/islandcn/glyph'
import {CheckCircleGlyph, glyphFrom, SparkleGlyph, UploadGlyph} from '@/components/islandcn/glyphs'
import {ExpandedBottom, SensorRow} from '@/components/islandcn/island-layout'
import {
    BubbleForm,
    Caption,
    CompactText,
    ContextLabel,
    ExpandedSubtitle,
    ExpandedTitle,
    MinimalPair,
    NumberText,
    TitleStack,
} from '@/components/islandcn/island-text'
import {MetricRow} from '@/components/islandcn/metric'
import {Spinner} from '@/components/islandcn/spinner'
import {IslandButton, IslandRoundButton} from '@/components/islandcn/island-button'
import {islandAccent, islandInk, islandSize} from '@/components/islandcn/theme'
import {formatClock, TickingTime} from '@/components/islandcn/ticking-time'
import type {RsvpStatus} from '@/types.ts'

const EVENING_ID = 'evening'
const IDLE_STATUS_ID = 'idle-status'
const CELEBRATE_ID = 'celebration'
const QUICK_ENTRY_ID = 'quick-entry'
const UPLOAD_ID = 'upload'
const SYNC_ID = 'offline-sync'
const ACCENT = 'var(--accent)'

/** Narrower compact sensor cutout & max pill width so the centered pill clears the 84 px header wings on 375 px+ viewports. */
const HEADER_ISLAND_METRICS: IslandMetricsOverrides = {
    compact: {
        sensorWidth: 46,
        maxSlotWidth: 64,
        maxWidth: 192,
    },
}

const BowlingGlyph = glyphFrom('BowlingGlyph', BowlingPinsIcon)
const CalendarGlyph = glyphFrom('CalendarGlyph', Calendar03Icon)
const CloseGlyph = glyphFrom('CloseGlyph', Cancel01Icon)
const CrownGlyph = glyphFrom('CrownGlyph', CrownIcon, {parts: 'fill'})
const CloudSyncGlyph = glyphFrom('CloudSyncGlyph', CloudIcon, {parts: 'fill'})
const WalletGlyph = glyphFrom('WalletGlyph', Wallet01Icon)

const CATEGORY_ORDER: QueueCategory[] = [
    'evening', 'game', 'player', 'penalty', 'drink', 'highlight', 'team', 'rsvp', 'member', 'other',
]

function eur(v: number): string {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0})
}

function eurFull(v: number): string {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function openOwnProfile(tab: OpenProfileDetail['tab'] = 'season') {
    window.dispatchEvent(new CustomEvent<OpenProfileDetail>(OPEN_PROFILE_EVENT, {detail: {tab}}))
}

/** m:ss (or h:mm:ss) since an ISO start time; null when the start is unknown or unparsable. */
export function elapsedLabel(startedAt: string | null | undefined, now: number): string | null {
    if (!startedAt) return null
    const start = Date.parse(startedAt)
    if (Number.isNaN(start)) return null
    return formatClock(Math.max(0, now - start))
}

function EveningActivity({eveningId}: {eveningId: number}) {
    const t = useT()
    const island = useIslandActions()
    const throwTracking = useThrowTracking()
    const queryClient = useQueryClient()
    const [startingGame, setStartingGame] = useState(false)
    // Observe only — the evening hub owns fetching/SSE. `enabled: false` never triggers a request.
    const {data: evening} = useQuery({
        queryKey: ['evening', eveningId],
        queryFn: () => api.getEvening(eveningId),
        enabled: false,
    })

    const open = evening && !evening.is_closed ? evening : null
    const totals = eveningTotals(open)
    const {game, activePlayer} = currentGameState(open)
    const turnName = throwTracking && activePlayer ? (activePlayer.nickname || activePlayer.name) : null
    const openGame = nextOpenGame(open)
    const openGameId = openGame?.id ?? null
    const openGameName = openGame?.name ?? null
    const canStart = canStartGameInEvening(open)

    const startMs = game?.started_at ? Date.parse(game.started_at) : NaN
    const timed = Number.isFinite(startMs)

    const money = eur(totals.penaltyEuro)
    const gameLine = game
        ? [game.name, turnName].filter(Boolean).join(' · ')
        : t('island.noGame')
    const venue = open?.venue || t('island.title')
    const prevGameId = useRef<number | null | undefined>(undefined)

    useEffect(() => {
        if (!open) {
            prevGameId.current = undefined
            island.end(EVENING_ID)
            return
        }
        const gameChanged = prevGameId.current !== undefined && prevGameId.current !== (game?.id ?? null)
        prevGameId.current = game?.id ?? null

        const handleStartGame = async (gid: number) => {
            if (startingGame) return
            setStartingGame(true)
            try {
                await api.startGame(open.id, gid)
                await queryClient.invalidateQueries({queryKey: ['evening', open.id]})
            } catch (e) {
                toastError(e)
            } finally {
                setStartingGame(false)
            }
        }

        const noGame = !game
        const iconColor = noGame ? islandInk.secondary : ACCENT
        const statusColor = noGame ? islandAccent.yellow : ACCENT
        const leadingGlyph = <Glyph icon={BowlingGlyph} color={iconColor}/>
        const moneyNode = (
            <CompactText color={ACCENT}>
                <NumberText value={money}/>
            </CompactText>
        )
        const content = {
            label: noGame
                ? `${t('island.label')}: ${venue}, ${t('island.noGame')}, ${money}`
                : `${t('island.label')}: ${venue}, ${money}`,
            onPress: () => { router.navigate({to: '/evening'}).catch(() => {}) },
            compact: {
                leading: leadingGlyph,
                // In the attached pill, show the live game timer when a game is running, a calm
                // short "Pause"/"Idle" badge when no game is active, or the pot.
                trailing: (
                    <BubbleForm bubble={null}>
                        {timed ? (
                            <CompactText color={ACCENT}>
                                <TickingTime source={{kind: 'elapsed', since: startMs}}/>
                            </CompactText>
                        ) : noGame ? (
                            <CompactText color={statusColor}>{t('island.noGameShort')}</CompactText>
                        ) : (
                            moneyNode
                        )}
                    </BubbleForm>
                ),
            },
            minimal: (
                <MinimalPair
                    leading={leadingGlyph}
                    trailing={noGame ? <CompactText color={statusColor}>–</CompactText> : moneyNode}
                />
            ),
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={BowlingGlyph} color={iconColor} size={18}/>}>
                        <ContextLabel>{t('island.shortLabel')}</ContextLabel>
                    </SensorRow>
                ),
                trailing: (
                    <SensorRow align="end">
                        {timed ? (
                            <CompactText color={ACCENT}>
                                <TickingTime source={{kind: 'elapsed', since: startMs}}/>
                            </CompactText>
                        ) : game && totals.gamesTotal > 0 ? (
                            <Caption>{`${totals.gamesFinished}/${totals.gamesTotal}`}</Caption>
                        ) : (
                            moneyNode
                        )}
                    </SensorRow>
                ),
                bottom: game ? (
                    <ExpandedBottom reach="inset" gap={8}>
                        <TitleStack title={venue} subtitle={gameLine}/>
                        <MetricRow
                            metrics={[
                                {label: t('island.pot'), value: <NumberText value={money}/>, color: ACCENT},
                                {label: `🍺 ${t('drinks.beer')}`, value: <NumberText value={totals.beerRounds}/>},
                                {label: `🥃 ${t('drinks.shots')}`, value: <NumberText value={totals.shotRounds}/>},
                            ]}
                        />
                    </ExpandedBottom>
                ) : (
                    <ExpandedBottom reach="action" gap={10}>
                        <TitleStack
                            title={venue}
                            subtitle={`${gameLine} · 🍺 ${totals.beerRounds} · 🥃 ${totals.shotRounds}`}
                        />
                        {openGameId != null && openGameName && canStart ? (
                            <IslandButton
                                size="compact"
                                disabled={startingGame}
                                tone={{kind: 'accent', color: ACCENT, text: 'var(--on-accent)'}}
                                onPress={() => { handleStartGame(openGameId).catch(() => {}) }}
                            >
                                {`▶ ${openGameName}`}
                            </IslandButton>
                        ) : (
                            <IslandButton
                                size="compact"
                                tone={{kind: 'accent', color: ACCENT, text: 'var(--on-accent)'}}
                                onPress={() => {
                                    island.collapse()
                                    router.navigate({to: '/evening', search: {tab: 'games'}}).catch(() => {})
                                }}
                            >
                                {t('island.startGame')}
                            </IslandButton>
                        )}
                    </ExpandedBottom>
                ),
            },
        }

        if (gameChanged) {
            island.update(EVENING_ID, {...content, transition: 'crossfade'})
        } else {
            island.start({id: EVENING_ID, ...content})
        }
    }, [
        island,
        queryClient,
        open,
        money,
        gameLine,
        venue,
        timed,
        startMs,
        game,
        openGameId,
        openGameName,
        canStart,
        startingGame,
        totals.beerRounds,
        totals.shotRounds,
        totals.gamesFinished,
        totals.gamesTotal,
        t,
    ])

    useEffect(() => () => island.end(EVENING_ID), [island])

    return null
}

function CelebrationActivity() {
    const t = useT()
    const island = useIslandActions()

    useEffect(() => {
        let timer = 0
        const onCelebrate = (e: Event) => {
            const detail = (e as CustomEvent<CelebrateDetail>).detail
            if (!detail) return
            window.clearTimeout(timer)
            const isKing = detail.kind === 'king'
            const glyph = isKing ? CrownGlyph : SparkleGlyph
            const accent = islandAccent.yellow
            // The glyph already is the crown/sparkle: don't repeat it in the trailing slot, the context
            // label or the message text (callers prefix the message with an emoji for the toast).
            const short = isKing ? null : '9!'
            const message = detail.message.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '')
            island.start({
                id: CELEBRATE_ID,
                priority: 2,
                alert: true,
                label: message,
                onPress: () => { router.navigate({to: '/evening'}).catch(() => {}) },
                compact: {
                    leading: <Glyph icon={glyph} color={accent}/>,
                    trailing: short ? (
                        <BubbleForm bubble={null}>
                            <CompactText color={accent}>{short}</CompactText>
                        </BubbleForm>
                    ) : undefined,
                },
                minimal: short
                    ? <MinimalPair leading={<Glyph icon={glyph} color={accent}/>} trailing={<CompactText color={accent}>{short}</CompactText>}/>
                    : <Glyph icon={glyph} color={accent}/>,
                expanded: {
                    leading: (
                        <SensorRow glyph={<Glyph icon={glyph} color={accent} size={18}/>}>
                            <ContextLabel>{t('nav.evening')}</ContextLabel>
                        </SensorRow>
                    ),
                    bottom: (
                        <ExpandedBottom reach="lift">
                            <ExpandedTitle color={accent}>{message}</ExpandedTitle>
                        </ExpandedBottom>
                    ),
                },
            })
            timer = window.setTimeout(() => island.end(CELEBRATE_ID), 4200)
        }
        window.addEventListener(CELEBRATE_EVENT, onCelebrate)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener(CELEBRATE_EVENT, onCelebrate)
            island.end(CELEBRATE_ID)
        }
    }, [island, t])

    return null
}

function UploadActivity() {
    const t = useT()
    const island = useIslandActions()

    useEffect(() => {
        let timer = 0
        const onUpload = (e: Event) => {
            const detail = (e as CustomEvent<UploadStatusDetail>).detail
            if (!detail) return
            window.clearTimeout(timer)
            if (detail.status === 'error') {
                island.end(UPLOAD_ID)
                return
            }
            const done = detail.status === 'done'
            const accent = done ? islandAccent.green : islandAccent.blue
            const glyph = done ? CheckCircleGlyph : UploadGlyph
            const trailingNode = done ? (
                <CompactText color={accent}>✓</CompactText>
            ) : (
                <Spinner size={18} color={accent}/>
            )
            island.start({
                id: UPLOAD_ID,
                priority: 1,
                label: `${t('island.upload')}: ${detail.fileName}`,
                compact: {
                    leading: <Glyph icon={glyph} color={accent}/>,
                    trailing: trailingNode,
                },
                minimal: <MinimalPair leading={<Glyph icon={glyph} color={accent}/>} trailing={trailingNode}/>,
                expanded: {
                    leading: (
                        <SensorRow glyph={<Glyph icon={glyph} color={accent} size={18}/>}>
                            <ContextLabel>{t('island.upload')}</ContextLabel>
                        </SensorRow>
                    ),
                    trailing: (
                        <SensorRow align="end">
                            {trailingNode}
                        </SensorRow>
                    ),
                    bottom: (
                        <ExpandedBottom reach="lift">
                            <ExpandedSubtitle color={islandInk.primary}>{detail.fileName}</ExpandedSubtitle>
                        </ExpandedBottom>
                    ),
                },
            })
            if (done) {
                timer = window.setTimeout(() => island.end(UPLOAD_ID), 1600)
            }
        }
        window.addEventListener(UPLOAD_STATUS_EVENT, onUpload)
        return () => {
            window.clearTimeout(timer)
            window.removeEventListener(UPLOAD_STATUS_EVENT, onUpload)
            island.end(UPLOAD_ID)
        }
    }, [island, t])

    return null
}

function OfflineSyncActivity() {
    const t = useT()
    const island = useIslandActions()
    const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
    const [pendingCount, setPendingCount] = useState(0)
    const [groups, setGroups] = useState<Partial<Record<QueueCategory, number>>>({})
    const [syncing, setSyncing] = useState(false)

    useEffect(() => {
        let cancelled = false
        async function refresh() {
            try {
                const [count, grouped] = await Promise.all([offlineQueue.count(), groupQueuedRequests()])
                if (!cancelled) {
                    setPendingCount(count)
                    setGroups(grouped)
                }
            } catch {
                // IndexedDB unavailable — ignore
            }
        }
        refresh()
        const onOnline = () => { setOffline(false); refresh() }
        const onOffline = () => setOffline(true)
        const onQueue = () => refresh()
        const onSyncStart = () => setSyncing(true)
        const onSyncFlushed = () => { setSyncing(false); refresh() }

        window.addEventListener('online', onOnline)
        window.addEventListener('offline', onOffline)
        window.addEventListener('kegelkasse:queue-changed', onQueue)
        window.addEventListener(SYNC_STARTED_EVENT, onSyncStart)
        window.addEventListener(SYNC_FLUSHED_EVENT, onSyncFlushed)
        return () => {
            cancelled = true
            window.removeEventListener('online', onOnline)
            window.removeEventListener('offline', onOffline)
            window.removeEventListener('kegelkasse:queue-changed', onQueue)
            window.removeEventListener(SYNC_STARTED_EVENT, onSyncStart)
            window.removeEventListener(SYNC_FLUSHED_EVENT, onSyncFlushed)
        }
    }, [])

    useEffect(() => {
        if (pendingCount === 0 && !syncing) {
            island.end(SYNC_ID)
            return
        }
        const accent = syncing ? islandAccent.blue : islandAccent.orange
        const groupSummary = CATEGORY_ORDER
            .filter(cat => (groups[cat] ?? 0) > 0)
            .map(cat => {
                const n = groups[cat]!
                const key = n === 1
                    ? `sync.category.${cat}` as Parameters<typeof t>[0]
                    : `sync.category.${cat}.plural` as Parameters<typeof t>[0]
                return `${n}\u202f${t(key)}`
            })
            .join(' · ')

        const handleForceSync = async () => {
            if (syncing) return
            setSyncing(true)
            try {
                const {applied, errors} = await flushOfflineQueue()
                if (applied > 0) showToast(tStatic('sync.flushed'))
                if (errors > 0) showToast(tStatic('sync.flushErrors'), 'error')
            } finally {
                setSyncing(false)
            }
        }

        const trailingNode = syncing ? (
            <Spinner size={18} color={accent}/>
        ) : (
            <CompactText color={accent}>
                <NumberText value={pendingCount}/>
            </CompactText>
        )

        island.start({
            id: SYNC_ID,
            priority: 1,
            label: `${t('sync.pending')}: ${pendingCount}`,
            compact: {
                leading: <Glyph icon={CloudSyncGlyph} color={accent}/>,
                trailing: trailingNode,
            },
            minimal: <MinimalPair leading={<Glyph icon={CloudSyncGlyph} color={accent}/>} trailing={trailingNode}/>,
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={CloudSyncGlyph} color={accent} size={18}/>}>
                        <ContextLabel>{t('island.sync')}</ContextLabel>
                    </SensorRow>
                ),
                trailing: (
                    <SensorRow align="end">
                        {trailingNode}
                    </SensorRow>
                ),
                bottom: (
                    <ExpandedBottom reach={!offline && !syncing ? 'action' : 'lift'} gap={10}>
                        <TitleStack
                            title={`${t('sync.pending')}: ${pendingCount}`}
                            subtitle={groupSummary || (offline ? t('sync.offline') : undefined)}
                        />
                        {!offline && !syncing ? (
                            <IslandButton
                                size="compact"
                                tone={{kind: 'accent', color: accent}}
                                onPress={() => { handleForceSync().catch(() => {}) }}
                            >
                                {t('sync.forceSync')}
                            </IslandButton>
                        ) : null}
                    </ExpandedBottom>
                ),
            },
        })
    }, [island, offline, pendingCount, groups, syncing, t])

    useEffect(() => () => island.end(SYNC_ID), [island])

    return null
}

function getNotifRid(url: string): number | null {
    try {
        const hash = new URL(url, window.location.href).hash
        const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
        const rid = new URLSearchParams(q).get('rid')
        return rid ? parseInt(rid, 10) : null
    } catch {
        return null
    }
}

function PaymentRequestActivity() {
    const t = useT()
    const island = useIslandActions()
    const queryClient = useQueryClient()
    const {notifications, dismiss} = useNotificationStore()
    const [busyId, setBusyId] = useState<number | null>(null)

    const pendingNotif = notifications.find(n => !n.read && getNotifRid(n.url) !== null) ?? null
    const rid = pendingNotif ? getNotifRid(pendingNotif.url) : null
    const activityId = rid != null ? `payment-request-${rid}` : null

    useEffect(() => {
        if (!pendingNotif || rid == null || !activityId) return
        const accent = islandAccent.green
        const busy = busyId === rid

        const handleDecision = async (confirm: boolean) => {
            setBusyId(rid)
            try {
                if (confirm) await api.confirmPaymentRequest(rid)
                else await api.rejectPaymentRequest(rid)
                dismiss(pendingNotif.id)
                await queryClient.invalidateQueries({queryKey: ['payment-requests']})
                await queryClient.invalidateQueries({queryKey: ['balances']})
            } catch (e) {
                toastError(e)
            } finally {
                setBusyId(null)
            }
        }

        island.start({
            id: activityId,
            group: 'payment-requests',
            priority: 1,
            label: `${pendingNotif.title}: ${pendingNotif.body}`,
            onPress: () => { router.navigate({to: '/treasury', search: {tab: 'accounts'}}).catch(() => {}) },
            compact: {
                leading: <Glyph icon={WalletGlyph} color={accent}/>,
                trailing: (
                    <BubbleForm bubble={null}>
                        <CompactText color={accent}>€</CompactText>
                    </BubbleForm>
                ),
            },
            minimal: <MinimalPair leading={<Glyph icon={WalletGlyph} color={accent}/>} trailing={<CompactText color={accent}>€</CompactText>}/>,
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={WalletGlyph} color={accent} size={18}/>}>
                        <ContextLabel>{t('nav.treasury')}</ContextLabel>
                    </SensorRow>
                ),
                bottom: (
                    <ExpandedBottom reach="action" gap={12}>
                        <TitleStack title={pendingNotif.title} subtitle={pendingNotif.body}/>
                        <div style={{display: 'flex', gap: 10}}>
                            <IslandButton
                                size="compact"
                                disabled={busy}
                                onPress={() => { handleDecision(false).catch(() => {}) }}
                            >
                                {t('paymentRequest.reject')}
                            </IslandButton>
                            <IslandButton
                                size="compact"
                                disabled={busy}
                                tone={{kind: 'accent', color: accent}}
                                onPress={() => { handleDecision(true).catch(() => {}) }}
                            >
                                {t('paymentRequest.confirm')}
                            </IslandButton>
                        </div>
                    </ExpandedBottom>
                ),
            },
        })
        return () => island.end(activityId)
    }, [island, pendingNotif, rid, activityId, busyId, dismiss, queryClient, t])

    return null
}

// ── 6. Quick-entry booking events (penalty, drink round, undo, game start/finish) ───────────────

function QuickEntryActivity() {
    const island = useIslandActions()
    const [active, setActive] = useState<QuickEntryEventDetail | null>(null)
    const timerRef = useRef<number | null>(null)

    useEffect(() => {
        const onEvent = (e: Event) => {
            const detail = (e as CustomEvent<QuickEntryEventDetail>).detail
            if (!detail) return
            setActive(detail)
            if (timerRef.current) window.clearTimeout(timerRef.current)
            timerRef.current = window.setTimeout(() => setActive(null), 2600)
        }
        window.addEventListener(QUICK_ENTRY_EVENT, onEvent)
        return () => {
            window.removeEventListener(QUICK_ENTRY_EVENT, onEvent)
            if (timerRef.current) window.clearTimeout(timerRef.current)
        }
    }, [])

    useEffect(() => {
        if (!active) {
            island.end(QUICK_ENTRY_ID)
            return
        }
        const toneColor = active.kind === 'drink'
            ? islandAccent.green
            : active.kind === 'undo'
                ? islandAccent.red
                : ACCENT
        const label = [active.title, active.subtitle, active.badge].filter(Boolean).join(' · ')
        const leadingIcon = (
            <span aria-hidden="true" style={{fontSize: 14, lineHeight: 1}}>
                {active.icon}
            </span>
        )
        const trailingBadge = (
            <CompactText color={toneColor}>
                {active.badge ?? active.subtitle}
            </CompactText>
        )
        island.start({
            id: QUICK_ENTRY_ID,
            priority: 2,
            label,
            compact: {
                leading: (
                    <div style={{display: 'inline-flex', alignItems: 'center', gap: 5}}>
                        {leadingIcon}
                        <CompactText color={islandInk.primary}>
                            {active.title}
                        </CompactText>
                    </div>
                ),
                trailing: (
                    <BubbleForm bubble={null}>
                        <div style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                            <CompactText color={islandInk.secondary}>
                                {active.subtitle}
                            </CompactText>
                            {active.badge ? (
                                <CompactText color={toneColor}>
                                    {active.badge}
                                </CompactText>
                            ) : null}
                        </div>
                    </BubbleForm>
                ),
            },
            minimal: (
                <MinimalPair
                    leading={leadingIcon}
                    trailing={trailingBadge}
                />
            ),
            expanded: {
                leading: (
                    <SensorRow glyph={leadingIcon}>
                        <ContextLabel>{active.title}</ContextLabel>
                    </SensorRow>
                ),
                trailing: active.badge ? (
                    <SensorRow align="end">
                        <CompactText color={toneColor}>{active.badge}</CompactText>
                    </SensorRow>
                ) : undefined,
                bottom: (
                    <ExpandedBottom reach="lift">
                        <TitleStack
                            title={active.title}
                            subtitle={[active.subtitle, active.badge].filter(Boolean).join(' · ')}
                        />
                    </ExpandedBottom>
                ),
            },
        })
        return () => island.end(QUICK_ENTRY_ID)
    }, [island, active])

    return null
}

// ── 7. Idle status (next scheduled evening / personal balance / schedule shortcut) ────────────

function IdleStatusActivity({eveningId}: {eveningId?: number | null}) {
    const t = useT()
    const island = useIslandActions()
    const queryClient = useQueryClient()
    const user = useAppStore(s => s.user)
    // Idle is the lowest-priority fallback: never share the header with a live activity (payment, upload, …).
    const othersActive = useIslandBusyStore(s => s.busy)
    const dismissed = useIdleIslandStore(s => s.dismissed)
    const dismissedScheduleId = useIdleIslandStore(s => s.dismissedScheduleId)
    const dismissIdle = useIdleIslandStore(s => s.dismiss)
    const awakenIdle = useIdleIslandStore(s => s.awaken)
    const rmid = user?.regular_member_id ?? null
    const locale = user?.preferred_locale ?? 'de'
    const isLoggedIn = !!user
    const [rsvpBusy, setRsvpBusy] = useState(false)
    const prevKind = useRef<IdleIslandMode['kind'] | null>(null)

    const {data: evening} = useQuery({
        queryKey: ['evening', eveningId ?? 0],
        queryFn: () => api.getEvening(eveningId!),
        enabled: false,
    })
    const eveningActiveOrLoading = eveningId != null && eveningId > 0 && (!evening || !evening.is_closed)

    const {data: schedules} = useQuery({
        queryKey: ['schedule'],
        queryFn: api.listScheduledEvenings,
        enabled: isLoggedIn && !eveningActiveOrLoading,
        staleTime: 60_000,
    })
    const {data: myBalance, isError: myBalanceError} = useQuery({
        queryKey: ['my-balance'],
        queryFn: api.getMyBalance,
        enabled: isLoggedIn && !eveningActiveOrLoading && rmid != null,
        staleTime: 60_000,
    })
    const {data: reminderSettings, isError: reminderSettingsError} = useQuery({
        queryKey: ['reminder-settings'],
        queryFn: api.getReminderSettings,
        enabled: isLoggedIn && !eveningActiveOrLoading,
        staleTime: 60_000,
    })

    const todayKey = todayLocalKey()
    const upcomingReminderDays = reminderSettings?.upcoming_evening?.days_before ?? DEFAULT_UPCOMING_REMINDER_DAYS
    const reminderReady = reminderSettings !== undefined || reminderSettingsError
    const mode = useMemo(
        () => deriveIdleIslandMode({
            hasOpenEvening: eveningActiveOrLoading,
            isLoggedIn,
            schedules,
            todayKey,
            regularMemberId: rmid,
            myBalance,
            balanceFailed: myBalanceError,
            upcomingReminderDays,
            reminderReady,
        }),
        [
            eveningActiveOrLoading,
            isLoggedIn,
            schedules,
            todayKey,
            rmid,
            myBalance,
            myBalanceError,
            upcomingReminderDays,
            reminderReady,
        ],
    )

    useEffect(() => {
        if (!mode || othersActive) {
            prevKind.current = null
            island.end(IDLE_STATUS_ID)
            return
        }
        if (dismissed) {
            if (mode.kind === 'schedule' && mode.appointment.id !== dismissedScheduleId) {
                awakenIdle()
                return
            }
            prevKind.current = null
            island.end(IDLE_STATUS_ID)
            return
        }
        const kindChanged = prevKind.current !== null && prevKind.current !== mode.kind
        prevKind.current = mode.kind
        const handleDismiss = () => {
            island.collapse()
            dismissIdle(mode.kind === 'schedule' ? mode.appointment.id : null)
        }
        const dismissButton = (
            <IslandRoundButton
                size={islandSize.button}
                label={t('island.dismiss')}
                onPress={handleDismiss}
            >
                <Glyph icon={CloseGlyph} size={18}/>
            </IslandRoundButton>
        )

        if (mode.kind === 'schedule') {
            const ap = mode.appointment
            const rsvpColor = ap.my_rsvp === 'attending'
                ? islandAccent.green
                : ap.my_rsvp === 'absent'
                    ? islandInk.secondary
                    : islandAccent.orange
            const compactTime = formatScheduleCompact(ap.scheduled_at, todayKey, locale, {
                today: t('island.today'),
                tomorrow: t('island.tomorrow'),
                inDays: (n) => t('island.inDays').replace('{n}', String(n)),
            })
            const fullDate = formatScheduleFull(ap.scheduled_at, locale)
            const rsvpText = ap.my_rsvp === 'attending'
                ? t('island.rsvp.attending')
                : ap.my_rsvp === 'absent'
                    ? t('island.rsvp.absent')
                    : t('island.rsvp.open')
            const subtitle = [
                ap.venue,
                ap.attending_count > 0 ? `✅ ${ap.attending_count}` : null,
                rsvpText,
            ].filter(Boolean).join(' · ')

            const handleRsvp = async (status: RsvpStatus) => {
                if (rsvpBusy) return
                setRsvpBusy(true)
                try {
                    await api.setRsvp(ap.id, status)
                    await queryClient.invalidateQueries({queryKey: ['schedule']})
                } catch (e) {
                    toastError(e)
                } finally {
                    setRsvpBusy(false)
                }
            }

            const leadingGlyph = <Glyph icon={CalendarGlyph} color={rsvpColor}/>
            const compactTrailing = <CompactText color={rsvpColor}>{compactTime}</CompactText>
            const balanceColor = mode.balanceState === 'owed' ? islandAccent.red : islandAccent.green

            const content = {
                label: `${t('island.nextEvening')}: ${fullDate}${ap.venue ? `, ${ap.venue}` : ''}`,
                onPress: () => { router.navigate({to: '/schedule', search: {evening: ap.id}}).catch(() => {}) },
                onDismiss: handleDismiss,
                compact: {
                    leading: leadingGlyph,
                    trailing: <BubbleForm bubble={null}>{compactTrailing}</BubbleForm>,
                },
                minimal: <MinimalPair leading={leadingGlyph} trailing={compactTrailing}/>,
                expanded: {
                    leading: (
                        <SensorRow glyph={<Glyph icon={CalendarGlyph} color={rsvpColor} size={18}/>}>
                            <ContextLabel>{t('island.nextEvening')}</ContextLabel>
                        </SensorRow>
                    ),
                    trailing: mode.balance != null ? (
                        <SensorRow align="end">
                            <CompactText color={balanceColor}>
                                <NumberText value={formatEurCompact(mode.balance)}/>
                            </CompactText>
                        </SensorRow>
                    ) : ap.attending_count > 0 ? (
                        <SensorRow align="end">
                            <Caption>{`✅ ${ap.attending_count}`}</Caption>
                        </SensorRow>
                    ) : undefined,
                    bottom: (
                        <ExpandedBottom reach="action" gap={10}>
                            <TitleStack title={fullDate} subtitle={subtitle}/>
                            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                {ap.my_rsvp !== 'attending' ? (
                                    <IslandButton
                                        size="compact"
                                        disabled={rsvpBusy}
                                        tone={{kind: 'accent', color: islandAccent.green}}
                                        onPress={() => { handleRsvp('attending').catch(() => {}) }}
                                    >
                                        {t('home.rsvp.accept')}
                                    </IslandButton>
                                ) : (
                                    <IslandButton
                                        size="compact"
                                        disabled={rsvpBusy}
                                        onPress={() => { handleRsvp('absent').catch(() => {}) }}
                                    >
                                        {t('home.rsvp.decline')}
                                    </IslandButton>
                                )}
                                {ap.my_rsvp == null ? (
                                    <IslandButton
                                        size="compact"
                                        disabled={rsvpBusy}
                                        onPress={() => { handleRsvp('absent').catch(() => {}) }}
                                    >
                                        {t('home.rsvp.decline')}
                                    </IslandButton>
                                ) : (
                                    <IslandButton
                                        size="compact"
                                        onPress={() => {
                                            island.collapse()
                                            router.navigate({to: '/schedule', search: {evening: ap.id}}).catch(() => {})
                                        }}
                                    >
                                        {t('nav.schedule')}
                                    </IslandButton>
                                )}
                                {dismissButton}
                            </div>
                        </ExpandedBottom>
                    ),
                },
            }

            if (kindChanged) {
                island.update(IDLE_STATUS_ID, {...content, priority: -1, transition: 'crossfade'})
            } else {
                island.start({id: IDLE_STATUS_ID, priority: -1, ...content})
            }
            return
        }

        if (mode.kind === 'balance') {
            const balanceColor = mode.balanceState === 'owed' ? islandAccent.red : islandAccent.green
            const compactAmount = formatEurCompact(mode.balance)
            const fullAmount = formatEurFull(mode.balance)
            const statusLabel = t(
                mode.balanceState === 'owed'
                    ? 'home.balance.owed'
                    : mode.balanceState === 'credit'
                        ? 'home.balance.credit'
                        : 'home.balance.settled',
            )
            const leadingGlyph = <Glyph icon={WalletGlyph} color={balanceColor}/>
            const compactTrailing = (
                <CompactText color={balanceColor}>
                    <NumberText value={compactAmount}/>
                </CompactText>
            )
            const openTreasury = () => {
                router.navigate({
                    to: '/treasury',
                    search: {tab: 'accounts', ...(rmid != null ? {member: rmid} : {})},
                }).catch(() => {})
            }
            const accountSubtitle = mode.penaltyTotal != null && mode.paymentsTotal != null
                ? `${t('treasury.penaltiesLabel')}: ${eurFull(mode.penaltyTotal)} · ${t('treasury.paidLabel')}: ${eurFull(mode.paymentsTotal)}`
                : t('island.noUpcomingEvening')

            const content = {
                label: `${t('profile.myBalance')}: ${fullAmount}`,
                onPress: () => openOwnProfile('season'),
                onDismiss: handleDismiss,
                compact: {
                    leading: leadingGlyph,
                    trailing: <BubbleForm bubble={null}>{compactTrailing}</BubbleForm>,
                },
                minimal: <MinimalPair leading={leadingGlyph} trailing={compactTrailing}/>,
                expanded: {
                    leading: (
                        <SensorRow glyph={<Glyph icon={WalletGlyph} color={balanceColor} size={18}/>}>
                            <ContextLabel>{t('profile.myBalance')}</ContextLabel>
                        </SensorRow>
                    ),
                    trailing: (
                        <SensorRow align="end">
                            <CompactText color={balanceColor}>{statusLabel}</CompactText>
                        </SensorRow>
                    ),
                    bottom: (
                        <ExpandedBottom reach="action" gap={10}>
                            <TitleStack
                                title={<NumberText value={fullAmount}/>}
                                subtitle={accountSubtitle}
                            />
                            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                                <IslandButton
                                    size="compact"
                                    onPress={() => {
                                        island.collapse()
                                        openOwnProfile('season')
                                    }}
                                >
                                    {t('profile.myBalance')}
                                </IslandButton>
                                <IslandButton
                                    size="compact"
                                    tone={{kind: 'accent', color: balanceColor}}
                                    onPress={() => {
                                        island.collapse()
                                        openTreasury()
                                    }}
                                >
                                    {t('nav.treasury')}
                                </IslandButton>
                                {dismissButton}
                            </div>
                        </ExpandedBottom>
                    ),
                },
            }

            if (kindChanged) {
                island.update(IDLE_STATUS_ID, {...content, priority: -1, transition: 'crossfade'})
            } else {
                island.start({id: IDLE_STATUS_ID, priority: -1, ...content})
            }
            return
        }

        const leadingGlyph = <Glyph icon={WalletGlyph} color={ACCENT}/>
        const shortNode = <CompactText color={ACCENT}>{t('island.idleShort')}</CompactText>
        const content = {
            label: `${t('island.idleShort')}: ${t('island.idleHint')}`,
            onPress: () => openOwnProfile('season'),
            onDismiss: handleDismiss,
            compact: {
                leading: leadingGlyph,
                trailing: <BubbleForm bubble={null}>{shortNode}</BubbleForm>,
            },
            minimal: <MinimalPair leading={leadingGlyph} trailing={shortNode}/>,
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={WalletGlyph} color={ACCENT} size={18}/>}>
                        <ContextLabel>{t('profile.myBalance')}</ContextLabel>
                    </SensorRow>
                ),
                bottom: (
                    <ExpandedBottom reach="action" gap={10}>
                        <TitleStack
                            title={user?.name || t('profile.title')}
                            subtitle={t('island.idleHint')}
                        />
                        <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                            <IslandButton
                                size="compact"
                                onPress={() => {
                                    island.collapse()
                                    router.navigate({to: '/schedule'}).catch(() => {})
                                }}
                            >
                                {t('nav.schedule')}
                            </IslandButton>
                            <IslandButton
                                size="compact"
                                tone={{kind: 'accent', color: ACCENT, text: 'var(--on-accent)'}}
                                onPress={() => {
                                    island.collapse()
                                    openOwnProfile('season')
                                }}
                            >
                                {t('profile.myBalance')}
                            </IslandButton>
                            {dismissButton}
                        </div>
                    </ExpandedBottom>
                ),
            },
        }

        if (kindChanged) {
            island.update(IDLE_STATUS_ID, {...content, priority: -1, transition: 'crossfade'})
        } else {
            island.start({id: IDLE_STATUS_ID, priority: -1, ...content})
        }
    }, [
        island,
        queryClient,
        mode,
        othersActive,
        dismissed,
        dismissedScheduleId,
        dismissIdle,
        awakenIdle,
        todayKey,
        locale,
        rmid,
        rsvpBusy,
        user?.name,
        t,
    ])

    useEffect(() => () => island.end(IDLE_STATUS_ID), [island])

    return null
}

function IdleAwakenWatcher() {
    const {activities} = useIsland()
    const dismissed = useIdleIslandStore(s => s.dismissed)
    const awaken = useIdleIslandStore(s => s.awaken)
    const otherSignature = activities
        .filter(a => a.id !== IDLE_STATUS_ID)
        .map(a => `${a.id}:${a.revision}:${a.order}:${a.label}`)
        .join('|')
    const prevSigRef = useRef('')
    const setBusy = useIslandBusyStore(s => s.setBusy)
    const busy = otherSignature !== ''

    useEffect(() => {
        setBusy(busy)
        return () => setBusy(false)
    }, [busy, setBusy])

    useEffect(() => {
        if (!dismissed) {
            prevSigRef.current = otherSignature
            return
        }
        if (otherSignature && otherSignature !== prevSigRef.current) {
            prevSigRef.current = otherSignature
            awaken()
            return
        }
        prevSigRef.current = otherSignature
    }, [dismissed, otherSignature, awaken])

    return null
}

export function IslandActivities({eveningId}: {eveningId?: number | null}) {
    return (
        <>
            {eveningId != null && eveningId > 0 && <EveningActivity eveningId={eveningId}/>}
            <IdleStatusActivity eveningId={eveningId}/>
            <IdleAwakenWatcher/>
            <CelebrationActivity/>
            <QuickEntryActivity/>
            <UploadActivity/>
            <OfflineSyncActivity/>
            <PaymentRequestActivity/>
        </>
    )
}

export default function EveningIsland({
    eveningId,
    backdrop,
    children,
}: {
    eveningId?: number | null
    backdrop?: string
    children?: ReactNode
}) {
    return (
        <IslandProvider metrics={HEADER_ISLAND_METRICS}>
            <Island
                placement="container"
                label="Live"
                backdrop={backdrop}
                style={{top: -4, zIndex: 40}}
            />
            <IslandActivities eveningId={eveningId}/>
            {children}
        </IslandProvider>
    )
}
