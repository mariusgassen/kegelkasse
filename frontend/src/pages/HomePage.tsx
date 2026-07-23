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
import {CalendarDays, Wallet, Users, BarChart2, Trophy, ChevronRight} from 'lucide-react'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useThrowTracking} from '@/hooks/useClub.ts'
import {router} from '@/router'
import {toastError} from '@/utils/error.ts'
import {Loading} from '@/components/ui/Loading.tsx'
import type {RsvpStatus, ScheduledEvening} from '@/types.ts'
import {
    nextAppointment,
    recentCommunity,
    balanceState,
    recentThrowAvgs,
    type CommunityItem,
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
            <path d={path} fill="none" stroke="var(--kce-primary)" strokeWidth={2}
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
                <h2 className="text-sm font-bold text-kce-cream">{title}</h2>
                {action && (
                    <button onClick={onAction}
                            className="text-[11px] font-bold text-kce-primary flex items-center gap-0.5 active:opacity-70">
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
    return (
        <div>
            <div className="text-base font-bold text-kce-cream">{fDateTime(se.scheduled_at, locale)}</div>
            {se.venue && <div className="text-xs text-kce-muted mt-0.5 truncate">🏠 {se.venue}</div>}
            {se.attending_count > 0 && (
                <div className="text-[11px] text-kce-muted mt-0.5">✅ {se.attending_count}</div>
            )}
            <div className="flex gap-2 mt-2.5">
                <button disabled={busy} onClick={() => setStatus('attending')}
                        className={['flex-1 text-xs py-2 px-3 rounded-full border font-bold transition-all active:scale-95 select-none',
                            attending
                                ? 'bg-green-500/20 text-green-400 border-green-500/40'
                                : 'bg-kce-surface2 text-kce-muted border-kce-border'].join(' ')}>
                    {t('rsvp.attending.short')}
                </button>
                <button disabled={busy} onClick={() => setStatus('absent')}
                        className={['flex-1 text-xs py-2 px-3 rounded-full border font-bold transition-all active:scale-95 select-none',
                            absent
                                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                : 'bg-kce-surface2 text-kce-muted border-kce-border'].join(' ')}>
                    {t('rsvp.absent.short')}
                </button>
            </div>
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
                <div className="text-xs font-bold text-kce-cream truncate">{item.title}</div>
                {item.subtitle && <div className="text-[11px] text-kce-muted truncate">{item.subtitle}</div>}
            </div>
            <ChevronRight size={14} strokeWidth={2} className="flex-shrink-0 text-kce-muted"/>
        </button>
    )
}

// ── Quick-action tile ─────────────────────────────────────────────────────────
function QuickAction({icon: Icon, label, onClick}: {
    icon: typeof CalendarDays
    label: string
    onClick: () => void
}) {
    return (
        <button onClick={onClick}
                className="kce-card p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform">
            <Icon size={22} strokeWidth={2} className="text-kce-primary"/>
            <span className="text-[11px] font-bold text-kce-cream text-center leading-tight">{label}</span>
        </button>
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

    const upcoming = nextAppointment(schedules ?? [], todayKey())
    const news = recentCommunity(announcements, trips, 3)
    const bState = balanceState(myBalance?.balance)
    const spark = recentThrowAvgs(throwStats, 8)

    function refreshSchedule() {
        qc.invalidateQueries({queryKey: ['schedule']})
    }

    return (
        <div className="page-scroll px-3 py-3 pb-24 space-y-3">
            {/* Greeting */}
            <div className="pt-1">
                <h1 className="font-display font-bold text-xl text-kce-cream">
                    {displayName ? t('home.greeting').replace('{name}', displayName) : t('home.greetingNoName')}
                </h1>
                <p className="text-xs text-kce-muted mt-0.5">{t('home.subtitle')}</p>
            </div>

            {/* Active evening callout */}
            {activeEveningId && (
                <button
                    onClick={() => router.navigate({to: '/evening', search: {tab: 'manage'}}).catch(() => {})}
                    className="w-full kce-card p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
                    style={{
                        background: 'color-mix(in srgb, var(--kce-primary) 12%, var(--kce-surface))',
                        borderColor: 'color-mix(in srgb, var(--kce-primary) 45%, transparent)',
                    }}>
                    <Trophy size={22} strokeWidth={2.2} className="text-kce-primary flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-kce-cream">{t('home.eveningLive.title')}</div>
                        <div className="text-[11px] text-kce-muted">{t('home.eveningLive.sub')}</div>
                    </div>
                    <ChevronRight size={16} strokeWidth={2.5} className="text-kce-primary flex-shrink-0"/>
                </button>
            )}

            {/* Start-evening callout (admins only, when nothing is running). The evening nav tab is
                hidden while no evening is active, so this is the admin's entry to the start form. */}
            {!activeEveningId && isAdmin(user) && (
                <button
                    onClick={() => router.navigate({to: '/evening'}).catch(() => {})}
                    className="w-full kce-card p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
                    <Trophy size={22} strokeWidth={2.2} className="text-kce-muted flex-shrink-0"/>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-kce-cream">{t('home.startEvening.title')}</div>
                        <div className="text-[11px] text-kce-muted">{t('home.startEvening.sub')}</div>
                    </div>
                    <ChevronRight size={16} strokeWidth={2.5} className="text-kce-muted flex-shrink-0"/>
                </button>
            )}

            {/* Next appointment */}
            <Section title={t('home.nextAppointment')} action={t('home.allDates')}
                     onAction={() => router.navigate({to: '/schedule'}).catch(() => {})}>
                {schedLoading ? (
                    <Loading/>
                ) : upcoming ? (
                    <NextAppointment se={upcoming} locale={user?.preferred_locale ?? 'de'} onChanged={refreshSchedule}/>
                ) : (
                    <p className="text-xs text-kce-muted py-1">{t('home.noAppointment')}</p>
                )}
            </Section>

            {/* My account */}
            {rmid && (
                <Section title={t('profile.myBalance')} action={t('home.toTreasury')}
                         onAction={() => router.navigate({to: '/treasury', search: {tab: 'accounts', member: rmid}}).catch(() => {})}>
                    {myBalance?.balance != null ? (
                        <div className="flex items-center justify-between">
                            <div className={['font-display font-bold text-2xl',
                                bState === 'owed' ? 'text-red-400' : bState === 'credit' ? 'text-green-400' : 'text-kce-muted'].join(' ')}>
                                {fe(myBalance.balance)}
                            </div>
                            <div className="text-xs font-bold px-2.5 py-1 rounded-full"
                                 style={{
                                     background: 'var(--kce-surface2)',
                                     color: bState === 'owed' ? '#f87171' : bState === 'credit' ? '#4ade80' : 'var(--kce-muted)',
                                 }}>
                                {bState === 'owed' ? t('home.balance.owed') : bState === 'credit' ? t('home.balance.credit') : t('home.balance.settled')}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-kce-muted py-1">{t('home.balance.settled')}</p>
                    )}
                </Section>
            )}

            {/* Community news */}
            {news.length > 0 && (
                <Section title={t('home.community')} action={t('home.allNews')}
                         onAction={() => router.navigate({to: '/committee', search: {tab: 'announcements'}}).catch(() => {})}>
                    <div className="divide-y divide-kce-surface2">
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
                            <div className="font-display font-bold text-2xl text-kce-cream">
                                {throwStats.avg_pins.toFixed(1)}
                            </div>
                            <div className="text-[11px] text-kce-muted">{t('home.avgPins')}</div>
                        </div>
                        <Sparkline points={spark}/>
                    </div>
                </Section>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-4 gap-2">
                <QuickAction icon={CalendarDays} label={t('nav.schedule')}
                             onClick={() => router.navigate({to: '/schedule'}).catch(() => {})}/>
                <QuickAction icon={Wallet} label={t('nav.treasury')}
                             onClick={() => router.navigate({to: '/treasury'}).catch(() => {})}/>
                <QuickAction icon={Users} label={t('nav.committee')}
                             onClick={() => router.navigate({to: '/committee'}).catch(() => {})}/>
                <QuickAction icon={BarChart2} label={t('nav.stats')}
                             onClick={() => router.navigate({to: '/stats'}).catch(() => {})}/>
            </div>
        </div>
    )
}
