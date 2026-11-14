/**
 * Dynamic-Island-style live activities (islandcn engine `lib/island` + content kit `components/islandcn`).
 *
 * Mounted once at the app root (`RootLayout.tsx` owns `<IslandProvider>` and `<Island placement="viewport"/>`,
 * with a standalone fallback when rendered in isolation in unit tests). Reports real live/time-taking work:
 *   1. Running evening & active game timer (`id: 'evening'`) — compact: bowling glyph + game timer or pot;
 *      expanded: venue, running game / active player, and `MetricRow` for pot + beer/shot rounds.
 *   2. König & Alle-Neune moments (`id: 'celebration'`, `priority: 2`, `alert: true`) — brief alerting
 *      takeover when `celebrate()` fires.
 *   3. Media uploads (`id: 'upload'`, `priority: 1`) — live spinner while `uploadMedia()` runs, brief
 *      check mark on completion.
 *   4. Offline queue & background sync (`id: 'offline-sync'`, `priority: 1`) — pending mutation count,
 *      category breakdown, and a "Sync now" `IslandButton` when back online.
 *   5. Incoming payment-request approvals (`id: 'payment-request-<rid>'`, `group: 'payment-requests'`) —
 *      treasurer confirm/reject actions directly from the expanded island.
 */
import {useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {BowlingPinsIcon, CloudIcon, CrownIcon, Wallet01Icon} from '@hugeicons/core-free-icons'
import {
    api,
    flushOfflineQueue,
    type UploadStatusDetail,
} from '@/api/client.ts'

export const UPLOAD_STATUS_EVENT = 'kegelkasse:upload-status'
export const SYNC_STARTED_EVENT = 'kegelkasse:sync-started'
import {router} from '@/router'
import {useT, t as tStatic} from '@/i18n'
import {currentGameState, eveningTotals} from '@/lib/liveEvening.ts'
import {CELEBRATE_EVENT, type CelebrateDetail} from '@/lib/celebrate.ts'
import {offlineQueue, groupQueuedRequests, SYNC_FLUSHED_EVENT, type QueueCategory} from '@/offlineQueue.ts'
import {useNotificationStore} from '@/store/notifications.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {Island, IslandProvider, useIslandActions} from '@/lib/island'
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
import {IslandButton} from '@/components/islandcn/island-button'
import {islandAccent, islandInk} from '@/components/islandcn/theme'
import {formatClock, TickingTime} from '@/components/islandcn/ticking-time'

const EVENING_ID = 'evening'
const CELEBRATE_ID = 'celebration'
const UPLOAD_ID = 'upload'
const SYNC_ID = 'offline-sync'
const ACCENT = 'var(--accent)'

const BowlingGlyph = glyphFrom('BowlingGlyph', BowlingPinsIcon)
const CrownGlyph = glyphFrom('CrownGlyph', CrownIcon, {parts: 'fill'})
const CloudSyncGlyph = glyphFrom('CloudSyncGlyph', CloudIcon, {parts: 'fill'})
const WalletGlyph = glyphFrom('WalletGlyph', Wallet01Icon)

const CATEGORY_ORDER: QueueCategory[] = [
    'evening', 'game', 'player', 'penalty', 'drink', 'highlight', 'team', 'rsvp', 'member', 'other',
]

function eur(v: number): string {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0})
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
    // Observe only — the evening hub owns fetching/SSE. `enabled: false` never triggers a request.
    const {data: evening} = useQuery({
        queryKey: ['evening', eveningId],
        queryFn: () => api.getEvening(eveningId),
        enabled: false,
    })

    const open = evening && !evening.is_closed ? evening : null
    const totals = eveningTotals(open)
    const {game, activePlayer} = currentGameState(open)
    const turnName = activePlayer ? (activePlayer.nickname || activePlayer.name) : null

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

        const leadingGlyph = <Glyph icon={BowlingGlyph} color={ACCENT}/>
        const moneyNode = (
            <CompactText color={ACCENT}>
                <NumberText value={money}/>
            </CompactText>
        )
        const content = {
            label: `${t('island.label')}: ${venue}, ${money}`,
            onPress: () => { router.navigate({to: '/evening'}).catch(() => {}) },
            compact: {
                leading: leadingGlyph,
                // In the attached pill, show the live game timer when a game is running, or the pot.
                // In the 62pt split capsule (~20pt trailing room), drop the wide trailing text so the
                // capsule stays a clean round icon bubble instead of clipping with an ellipsis.
                trailing: (
                    <BubbleForm bubble={null}>
                        {timed ? (
                            <CompactText color={ACCENT}>
                                <TickingTime source={{kind: 'elapsed', since: startMs}}/>
                            </CompactText>
                        ) : (
                            moneyNode
                        )}
                    </BubbleForm>
                ),
            },
            minimal: <MinimalPair leading={leadingGlyph} trailing={moneyNode}/>,
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={BowlingGlyph} color={ACCENT} size={18}/>}>
                        <ContextLabel>{t('island.shortLabel')}</ContextLabel>
                    </SensorRow>
                ),
                trailing: (
                    <SensorRow align="end">
                        {timed ? (
                            <CompactText color={ACCENT}>
                                <TickingTime source={{kind: 'elapsed', since: startMs}}/>
                            </CompactText>
                        ) : totals.gamesTotal > 0 ? (
                            <Caption>{`${totals.gamesFinished}/${totals.gamesTotal}`}</Caption>
                        ) : null}
                    </SensorRow>
                ),
                bottom: (
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
        open,
        money,
        gameLine,
        venue,
        timed,
        startMs,
        game?.id,
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
            const short = isKing ? '👑' : '9!'
            island.start({
                id: CELEBRATE_ID,
                priority: 2,
                alert: true,
                label: detail.message,
                onPress: () => { router.navigate({to: '/evening'}).catch(() => {}) },
                compact: {
                    leading: <Glyph icon={glyph} color={accent}/>,
                    trailing: (
                        <BubbleForm bubble={null}>
                            <CompactText color={accent}>{short}</CompactText>
                        </BubbleForm>
                    ),
                },
                minimal: <MinimalPair leading={<Glyph icon={glyph} color={accent}/>} trailing={<CompactText color={accent}>{short}</CompactText>}/>,
                expanded: {
                    leading: (
                        <SensorRow glyph={<Glyph icon={glyph} color={accent} size={18}/>}>
                            <ContextLabel>{short}</ContextLabel>
                        </SensorRow>
                    ),
                    bottom: (
                        <ExpandedBottom reach="lift">
                            <ExpandedTitle color={accent}>{detail.message}</ExpandedTitle>
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
    }, [island])

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

export function IslandActivities({eveningId}: {eveningId?: number | null}) {
    return (
        <>
            {eveningId != null && eveningId > 0 && <EveningActivity eveningId={eveningId}/>}
            <CelebrationActivity/>
            <UploadActivity/>
            <OfflineSyncActivity/>
            <PaymentRequestActivity/>
        </>
    )
}

export default function EveningIsland({
    eveningId,
    backdrop,
}: {
    eveningId?: number | null
    backdrop?: string
}) {
    return (
        <IslandProvider>
            <Island placement="viewport" label="Live" backdrop={backdrop} style={{zIndex: 60}}/>
            <IslandActivities eveningId={eveningId}/>
        </IslandProvider>
    )
}
