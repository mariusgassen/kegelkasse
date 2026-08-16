/**
 * Start dashboard — "Für dich" (#66).
 *
 * The personalized landing page shown by default when there is no active evening (the router's
 * index redirect picks this over /evening). It is pure composition over existing endpoints
 * (schedule, my-balance, committee, stats/me) — no new backend. All derivation lives in the
 * pure helpers in `lib/dashboard.ts`; this component is the view.
 */
import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Trophy, ChevronRight} from 'lucide-react'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {useThrowTracking} from '@/hooks/useClub.ts'
import {router} from '@/router'
import {toastError} from '@/utils/error.ts'
import {SkeletonCard} from '@/components/ui/Skeleton'
import {CountUp} from '@/components/ui/CountUp'
import type {RsvpStatus, ScheduledEvening} from '@/types.ts'
import {
    nextAppointment,
    recentCommunity,
    balanceState,
    recentThrowAvgs,
    recentPenaltyEvenings,
    type CommunityItem,
    type PenaltyEveningSummary,
} from '@/lib/dashboard.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function todayKey(): string {
    // Local YYYY-MM-DD (matches how scheduled_at dates are displayed).
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fDateTime(scheduledAt: string, locale: string): string {
    const date = new Date(scheduledAt.slice(0, 10) + 'T00:00:00')
    const day = date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', {
        weekday: 'long', day: '2-digit', month: 'long',
    })
    const time = scheduledAt.slice(11, 16)
    return time ? `${day} · ${time}` : day
}

// ── Sparkline (per-evening throw averages) ────────────────────────────────────
function Sparkline({points}: {points: number[]}) {
    if (points.length < 2) return null
    const w = 88
    const h = 28
    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = max - min || 1
    const step = w / (points.length - 1)
    const path = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
        .join(' ')
    return (
        <svg width={w} height={h} className="flex-shrink-0" aria-hidden="true">
            <path d={path} fill="none" stroke="var(--accent-fg)" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    )
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function Section({title, action, onAction, children}: {
    title: string
    action?: string
    onAction?: () => void
    children: React.ReactNode
}) {
    return (
        <div className="kce-card p-3">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-ink">{title}</h2>
                {action && (
                    <button onClick={onAction}
                            className="text-sm font-bold text-accent-fg flex items-center gap-0.5 active:opacity-70">
                        {action} <ChevronRight size={12} strokeWidth={2.5}/>
                    </button>
                )}
            </div>
            {children}
        </div>
    )
}

// ── Next appointment card with inline RSVP ────────────────────────────────────
function NextAppointment({se, locale, onChanged}: {
    se: ScheduledEvening
    locale: string
    onChanged: () => void
}) {
    const t = useT()
    const [busy, setBusy] = useState(false)

    async function setStatus(status: RsvpStatus) {
        setBusy(true)
        try {
            if (se.my_rsvp === status) await api.removeRsvp(se.id)
            else await api.setRsvp(se.id, status)
            onChanged()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    const attending = se.my_rsvp === 'attending'
    const absent = se.my_rsvp === 'absent'
    const responded = attending || absent
    return (
        <div>
            <div className="text-base font-bold text-ink">{fDateTime(se.scheduled_at, locale)}</div>
            {se.venue && <div className="text-xs text-muted mt-0.5 truncate">🏠 {se.venue}</div>}
            {se.attending_count > 0 && (
                <div className="text-sm text-muted mt-0.5">✅ {se.attending_count}</div>
            )}

            {responded ? (
                // Already answered → show the current state and offer the single opposite action.
                <div className="flex items-center justify-between gap-2 mt-2.5">
                    <span className={['text-xs font-bold px-2.5 py-1.5 rounded-full',
                        attending
                            ? 'bg-positive/20 text-positive-fg'
                            : 'bg-danger/20 text-danger-fg'].join(' ')}>
                        {attending ? t('home.rsvp.attendingState') : t('home.rsvp.absentState')}
                    </span>
                    <button disabled={busy} onClick={() => setStatus(attending ? 'absent' : 'attending')}
                            className="text-xs font-bold py-1.5 px-3 rounded-full border border-line bg-surface-2 text-muted transition-all active:scale-95 select-none">
                        {attending ? t('home.rsvp.decline') : t('home.rsvp.accept')}
                    </button>
                </div>
            ) : (
                // No answer yet → prompt for the initial choice.
                <div className="mt-2.5">
                    <div className="text-sm text-muted mb-1.5">{t('home.rsvp.prompt')}</div>
                    <div className="flex gap-2">
                        <button disabled={busy} onClick={() => setStatus('attending')}
                                className="flex-1 text-xs py-2 px-3 rounded-full border border-positive/40 bg-positive/15 text-positive-fg font-bold transition-all active:scale-95 select-none">
                            {t('home.rsvp.accept')}
                        </button>
                        <button disabled={busy} onClick={() => setStatus('absent')}
                                className="flex-1 text-xs py-2 px-3 rounded-full border border-line bg-surface-2 text-muted font-bold transition-all active:scale-95 select-none">
                            {t('home.rsvp.decline')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Community news row ─────────────────────────────────────────────────────────
function CommunityRow({item}: {item: CommunityItem}) {
    const icon = item.kind === 'trip' ? '🚌' : '📣'
    function open() {
        router.navigate({
            to: '/committee',
            search: {tab: item.kind === 'trip' ? 'trips' : 'announcements', item: item.id},
        }).catch(() => {})
    }
    return (
        <button onClick={open}
                className="w-full flex items-center gap-2 py-1.5 text-left active:opacity-70">
            <span className="text-base flex-shrink-0">{icon}</span>
            <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-ink truncate">{item.title}</div>
                {item.subtitle && <div className="text-sm text-muted truncate">{item.subtitle}</div>}
            </div>
            <ChevronRight size={14} strokeWidth={2} className="flex-shrink-0 text-muted"/>
        </button>
    )
}

// ── Recent penalty row ────────────────────────────────────────────────────────
function fShortDate(iso: string | null, locale: string): string {
    if (!iso) return ''
    const d = new Date(iso.slice(0, 10) + 'T00:00:00')
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'de-DE', {day: '2-digit', month: 'short'})
}

function PenaltyEveningGroup({g, locale}: {g: PenaltyEveningSummary; locale: string}) {
    const t = useT()
    return (
        <div className="py-2">
            {/* Evening header: date on the left, the evening's total on the right. */}
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-ink">
                    {fShortDate(g.date, locale) || t('home.penaltyUndated')}
                </div>
                <div className="text-sm font-bold text-accent-fg flex-shrink-0">{fe(g.total)}</div>
            </div>
            {/* A few of the evening's penalties, then "and N more". */}
            <div className="mt-1 space-y-0.5">
                {g.items.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                        <span className="text-sm flex-shrink-0">{p.icon}</span>
                        <div className="flex-1 min-w-0 text-sm text-muted truncate">{p.name}</div>
                        <div className="text-sm text-muted flex-shrink-0">{fe(p.amount)}</div>
                    </div>
                ))}
                {g.more > 0 && (
                    <div className="pl-6 text-sm italic text-muted">
                        {t('home.penaltyMore').replace('{n}', String(g.more))}
                    </div>
                )}
            </div>
        </div>
    )
}

export function HomePage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const regularMembers = useAppStore(s => s.regularMembers)
    const rmid = user?.regular_member_id ?? null

    const linkedMember = regularMembers.find(m => m.id === rmid)
    const displayName = linkedMember?.nickname || linkedMember?.name || user?.name || ''
    const throwTracking = useThrowTracking()

    const {data: schedules, isLoading: schedLoading} = useQuery({
        queryKey: ['schedule'],
        queryFn: api.listScheduledEvenings,
        staleTime: 30000,
    })
    const {data: myBalance} = useQuery({
        queryKey: ['my-balance'],
        queryFn: api.getMyBalance,
        enabled: !!rmid,
        staleTime: 30000,
    })
    const {data: announcements = []} = useQuery({
        queryKey: ['announcements'],
        queryFn: api.listAnnouncements,
        staleTime: 60000,
    })
    const {data: trips = []} = useQuery({
        queryKey: ['trips'],
        queryFn: api.listTrips,
        staleTime: 60000,
    })
    const {data: throwStats} = useQuery({
        queryKey: ['my-throws'],
        queryFn: () => api.getMyThrowStats(),
        enabled: !!rmid,
        staleTime: 60000,
    })
    const {data: myPenalties = []} = useQuery({
        queryKey: ['member-penalties', rmid],
        queryFn: () => api.getMemberPenalties(rmid as number),
        enabled: !!rmid,
        staleTime: 30000,
    })

    const locale = user?.preferred_locale ?? 'de'
    const upcoming = nextAppointment(schedules ?? [], todayKey())
    const news = recentCommunity(announcements, trips, 3)
    const bState = balanceState(myBalance?.balance)
    const spark = recentThrowAvgs(throwStats, 8)
    const penaltyEvenings = recentPenaltyEvenings(myPenalties, 3, 3)

    function refreshSchedule() {
        qc.invalidateQueries({queryKey: ['schedule']})
    }

    return (
        <div className="page-scroll px-3 py-3 pb-24 space-y-3">
            {/* Greeting */}
            <div className="pt-1">
                <h1 className="font-display font-bold text-xl text-ink">
                    {displayName ? t('home.greeting').replace('{name}', displayName) : t('home.greetingNoName')}
                </h1>
                <p className="text-xs text-muted mt-0.5">{t('home.subtitle')}</p>
            </div>

            {/* Active evening callout */}
            {activeEveningId && (
                <button
                    onClick={() => router.navigate({to: '/evening', search: {tab: 'manage'}}).catch(() => {})}
                    className="w-full kce-card p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                    style={{
                        background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
                        borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)',
                    }}>
                    <Trophy size={22} strokeWidth={2.2} className="text-accent-fg flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-ink">{t('home.eveningLive.title')}</div>
                        <div className="text-sm text-muted">{t('home.eveningLive.sub')}</div>
                    </div>
                    <ChevronRight size={16} strokeWidth={2.5} className="text-accent-fg flex-shrink-0"/>
                </button>
            )}

            {/* Next appointment */}
            <Section title={t('home.nextAppointment')} action={t('home.allDates')}
                     onAction={() => router.navigate({to: '/schedule'}).catch(() => {})}>
                {schedLoading ? (
                    <SkeletonCard lines={2}/>
                ) : upcoming ? (
                    <NextAppointment se={upcoming} locale={locale} onChanged={refreshSchedule}/>
                ) : (
                    <p className="text-xs text-muted py-1">{t('home.noAppointment')}</p>
                )}
            </Section>

            {/* My account */}
            {rmid && (
                <Section title={t('profile.myBalance')} action={t('home.toTreasury')}
                         onAction={() => router.navigate({to: '/treasury', search: {tab: 'accounts', member: rmid}}).catch(() => {})}>
                    {myBalance?.balance != null ? (
                        <div className="flex items-center justify-between">
                            <CountUp
                                value={myBalance.balance} format={fe}
                                className={['font-display font-bold text-2xl',
                                    bState === 'owed' ? 'text-danger-fg' : bState === 'credit' ? 'text-positive-fg' : 'text-muted'].join(' ')}/>
                            <div className="text-xs font-bold px-2.5 py-1 rounded-full"
                                 style={{
                                     background: 'var(--surface-2)',
                                     color: bState === 'owed' ? 'var(--danger-fg)' : bState === 'credit' ? 'var(--positive-fg)' : 'var(--muted)',
                                 }}>
                                {bState === 'owed' ? t('home.balance.owed') : bState === 'credit' ? t('home.balance.credit') : t('home.balance.settled')}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-muted py-1">{t('home.balance.settled')}</p>
                    )}
                </Section>
            )}

            {/* Community news */}
            {news.length > 0 && (
                <Section title={t('home.community')} action={t('home.allNews')}
                         onAction={() => router.navigate({to: '/committee', search: {tab: 'announcements'}}).catch(() => {})}>
                    <div className="divide-y divide-surface-2">
                        {news.map(item => <CommunityRow key={`${item.kind}-${item.id}`} item={item}/>)}
                    </div>
                </Section>
            )}

            {/* Personal season metric */}
            {throwTracking && throwStats && throwStats.throw_count > 0 && throwStats.avg_pins != null && (
                <Section title={t('home.mySeason')} action={t('home.toStats')}
                         onAction={() => router.navigate({to: '/stats', search: {tab: 'year'}}).catch(() => {})}>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="font-display font-bold text-2xl text-ink">
                                {throwStats.avg_pins.toFixed(1)}
                            </div>
                            <div className="text-sm text-muted">{t('home.avgPins')}</div>
                        </div>
                        <Sparkline points={spark}/>
                    </div>
                </Section>
            )}

            {/* Recent penalties, grouped by evening with the evening's total */}
            {rmid && penaltyEvenings.length > 0 && (
                <Section title={t('home.recentPenalties')} action={t('home.toTreasury')}
                         onAction={() => router.navigate({to: '/treasury', search: {tab: 'accounts', member: rmid}}).catch(() => {})}>
                    <div className="divide-y divide-surface-2">
                        {penaltyEvenings.map(g => <PenaltyEveningGroup key={g.key} g={g} locale={locale}/>)}
                    </div>
                </Section>
            )}
        </div>
    )
}
