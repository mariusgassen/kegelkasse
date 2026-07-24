/**
 * Root layout — the app shell (header, nav, overlays) rendered inside <RouterProvider> (#64).
 *
 * App.tsx keeps the boot/auth/splash/login flow; once authenticated it mounts the router, and
 * this component is the root route: it renders the persistent chrome around the active page's
 * <Outlet/>. The 7 pages used to be mounted at once (display:none); the router now mounts only
 * the active one, code-split and with scroll restoration.
 */
import {useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Outlet} from '@tanstack/react-router'
import {
    Home,
    Trophy,
    Wallet,
    CalendarDays,
    Users,
    UserRound,
    BarChart2,
    Settings,
    Bell,
    Search,
    type LucideIcon,
} from 'lucide-react'
import {useAppStore} from './store/app'
import {useT} from './i18n'
import {api} from './api/client'
import {router} from './router'
import {usePage} from './hooks/usePage'
import {usePullToRefresh} from './hooks/usePullToRefresh'
import {PullToRefreshIndicator} from './components/PullToRefreshIndicator'
import {AppLogoAnimated} from './components/Logo'
import {ToastContainer} from './components/ui/Toast'
import {OfflineBanner} from './components/ui/OfflineBanner'
import {InstallPrompt} from './components/InstallPrompt'
import {UpdatePrompt} from './components/UpdatePrompt'
import {ProfileSheet} from './components/ProfileSheet'
import {NotificationPanel} from './components/NotificationPanel'
import {GlobalSearch} from './components/GlobalSearch'
import {VpDebug} from './components/VpDebug'
import {useNotificationStore, unreadCount} from './store/notifications'
import {ROUTE_PAGES, type RoutePage, legacyHashToLocation} from './lib/legacyHash'

declare const __APP_VERSION__: string
// Guarded so it can't throw in environments where the build-time define isn't applied (tests).
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''

type PageId = RoutePage
type PrimaryNavId = RoutePage | 'verein'

// Primary bottom-bar / side-rail destinations. Kept deliberately short (4 + the contextual
// evening tab): the low-frequency club/people/analytics pages live behind the "Verein" hub
// below instead of each eating a permanent slot.
const PRIMARY_NAV: { id: PrimaryNavId; Icon: LucideIcon; labelKey: string }[] = [
    {id: 'home', Icon: Home, labelKey: 'nav.home'},
    {id: 'evening', Icon: Trophy, labelKey: 'nav.evening'},
    {id: 'treasury', Icon: Wallet, labelKey: 'nav.treasury'},
    {id: 'schedule', Icon: CalendarDays, labelKey: 'nav.schedule'},
    {id: 'verein', Icon: Users, labelKey: 'nav.verein'},
]

// The "Verein" hub groups these real routes. The primary Verein tab is active for the whole
// group and lands on the first section; a secondary strip (rendered under the header while on
// any group page) switches between them. Keeping them as real routes means every deep link,
// push URL and per-page test is untouched — only the top-level navigation is reorganised.
const VEREIN_PAGES: RoutePage[] = ['committee', 'members', 'stats', 'club']

const VEREIN_SECTIONS: { id: RoutePage; Icon: LucideIcon; labelKey: string; adminOnly?: boolean }[] = [
    {id: 'committee', Icon: Users, labelKey: 'nav.committee'},
    {id: 'members', Icon: UserRound, labelKey: 'nav.members'},
    {id: 'stats', Icon: BarChart2, labelKey: 'nav.stats'},
    {id: 'club', Icon: Settings, labelKey: 'nav.manage', adminOnly: true},
]

export function RootLayout() {
    const {user, activeEveningId} = useAppStore()
    const t = useT()
    const queryClient = useQueryClient()
    const [page, setPage] = usePage<PageId>('evening', [...ROUTE_PAGES])
    const isAdminRole = user?.role === 'admin' || user?.role === 'superadmin'
    const inVerein = VEREIN_PAGES.includes(page)
    const [profileOpen, setProfileOpen] = useState(false)
    const [notifOpen, setNotifOpen] = useState(false)
    const [searchOpen, setSearchOpen] = useState(false)
    // TEMP: viewport diagnostic — 5 quick taps on the logo/title opens it (see VpDebug.tsx).
    const [vpDebugOpen, setVpDebugOpen] = useState(false)
    const logoTaps = useRef<number[]>([])
    const onLogoTap = () => {
        const now = Date.now()
        logoTaps.current = [...logoTaps.current, now].filter(t => now - t < 2000)
        if (logoTaps.current.length >= 5) {
            logoTaps.current = []
            setVpDebugOpen(true)
        }
    }
    const {notifications} = useNotificationStore()
    const badgeCount = unreadCount(notifications)

    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, enabled: !!user, staleTime: 60000})

    async function handleRefresh() {
        await queryClient.invalidateQueries()
    }

    const {containerRef: mainRef, pullDistance, dragging: ptrDragging, refreshing: ptrRefreshing} =
        usePullToRefresh(handleRefresh)

    // Cmd/Ctrl+K opens global search from anywhere
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                setSearchOpen(true)
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [])

    // Legacy hash deep links (push notifications, global search, in-app links) still set
    // `window.location.hash`. Translate any recognised legacy hash into a router navigation
    // and clear the hash — the single compatibility point for all pre-#64 hash URLs.
    useEffect(() => {
        const onHash = () => {
            const legacy = legacyHashToLocation(window.location.hash)
            if (!legacy) return
            router.navigate({to: legacy.pathname, search: legacy.search, hash: ''}).catch(() => {})
        }
        window.addEventListener('hashchange', onHash)
        return () => window.removeEventListener('hashchange', onHash)
    }, [])

    return (
        <div className="app-shell">
            {/* Header region: safe-area spacer + banners + header bar (grid-area: header) */}
            <div className="app-header">
                {/* Safe-area spacer: absorbs the iOS notch/Dynamic Island inset once for the whole app */}
                <div className="safe-top" style={{background: 'var(--kce-bg)'}}/>
                <OfflineBanner/>
                <InstallPrompt/>
                <UpdatePrompt/>

                {/* ── Header ── */}
                <header style={{
                    background: 'var(--kce-bg)',
                    borderBottom: '1px solid var(--kce-border)',
                    zIndex: 50,
                }}>
                    <div className="flex items-center gap-2.5 px-3 py-2">
                        <div onClick={onLogoTap} style={{display: 'flex', flexShrink: 0, cursor: 'default'}}>
                            {club?.settings?.logo_url ? (
                                <img src={club.settings.logo_url} alt={club.name}
                                     style={{width: 28, height: 28, objectFit: 'contain', borderRadius: 6}}/>
                            ) : (
                                <AppLogoAnimated size={28}/>
                            )}
                        </div>
                        <div className="flex-1 min-w-0" onClick={onLogoTap}>
                            <h1 className="font-display font-bold text-kce-amber text-sm leading-tight truncate">
                                {club?.name || t('app.name')}
                            </h1>
                            <p className="text-[10px] text-kce-muted font-bold tracking-widest">{t('app.subtitle')}</p>
                        </div>
                        {activeEveningId && (
                            <button
                                className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1"
                                style={{background: 'color-mix(in srgb, var(--kce-primary) 15%, transparent)', color: 'var(--kce-primary)', border: '1px solid color-mix(in srgb, var(--kce-primary) 60%, transparent)'}}
                                onClick={() => { router.navigate({to: '/evening', search: {tab: 'manage'}}).catch(() => {}) }}>
                                <Trophy size={11} strokeWidth={2.5}/> {t('evening.active')}
                            </button>
                        )}
                        {/* Search button */}
                        <button
                            aria-label={t('search.title')}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity"
                            style={{background: 'rgba(255,255,255,0.07)', color: 'var(--kce-muted)'}}
                            onClick={() => setSearchOpen(true)}>
                            <Search size={14} strokeWidth={2}/>
                        </button>
                        {/* Notification bell */}
                        <button
                            aria-label={t('notifications.title')}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity relative"
                            style={{background: 'rgba(255,255,255,0.07)', color: 'var(--kce-muted)'}}
                            onClick={() => setNotifOpen(true)}>
                            <Bell size={14} strokeWidth={2}/>
                            {badgeCount > 0 && (
                                <span
                                    className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none px-0.5"
                                    style={{background: 'var(--kce-primary)', color: 'var(--kce-bg)'}}>
                                    {badgeCount > 9 ? '9+' : badgeCount}
                                </span>
                            )}
                        </button>
                        {/* Avatar button */}
                        <button
                            aria-label="Profil"
                            className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-sm flex-shrink-0 active:opacity-70 transition-opacity"
                            style={{
                                background: user?.avatar ? 'transparent' : 'linear-gradient(135deg,#c4701a,var(--kce-primary))',
                                color: 'var(--kce-bg)'
                            }}
                            onClick={() => setProfileOpen(true)}>
                            {user?.avatar
                                ? <img src={user.avatar} alt="" className="w-full h-full object-cover"/>
                                : (user?.name || '?')[0].toUpperCase()
                            }
                        </button>
                    </div>
                </header>

                {/* ── Verein hub secondary section strip ──
                    Shown only while on a Verein-group page. Switches between Neuigkeiten /
                    Mitglieder / Stats / (admin) Verwaltung without those each needing a primary
                    tab. Lives in the header region so it stays put as the page scrolls. */}
                {inVerein && (
                    <nav aria-label={t('nav.verein')}
                         className="verein-subnav flex gap-1 overflow-x-auto px-3 py-2"
                         style={{background: 'var(--kce-bg)', borderBottom: '1px solid var(--kce-border)'}}>
                        {VEREIN_SECTIONS.filter(s => !s.adminOnly || isAdminRole).map(s => (
                            <button key={s.id} type="button"
                                    onClick={() => setPage(s.id)}
                                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${page === s.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}>
                                <s.Icon size={14} strokeWidth={page === s.id ? 2.5 : 2}/>
                                {t(s.labelKey as never)}
                            </button>
                        ))}
                    </nav>
                )}
            </div>

            {/* ── Active page (router Outlet) ── */}
            <main ref={mainRef} className="app-main" style={{overflow: 'hidden', position: 'relative'}}>
                {/* Fixed at the top — revealed as the content below slides down on pull-to-refresh */}
                <PullToRefreshIndicator pullDistance={pullDistance} dragging={ptrDragging} refreshing={ptrRefreshing}/>

                {/* Content wrapper — slides 1:1 with the finger while dragging. Needs an opaque
                    background so the indicator underneath stays hidden until pulled. */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 1, background: 'var(--kce-bg)',
                    transform: `translateY(${pullDistance}px)`,
                    transition: ptrDragging ? 'none' : 'transform 0.25s ease-out',
                }}>
                    {/* key on page → the .page-pane enter animation restarts on each navigation */}
                    <div key={page} className="page-pane" style={{position: 'absolute', inset: 0}}>
                        <Outlet/>
                    </div>
                </div>
            </main>

            {/* ── Nav — bottom tab bar on mobile, side rail on ≥lg (via .app-nav grid area) ── */}
            <nav className="app-nav">
                {PRIMARY_NAV.filter(n =>
                    // The evening tab only appears while an evening is running — no dead tab when
                    // nothing is active. Admins start one from the home dashboard / schedule.
                    n.id !== 'evening' || !!activeEveningId,
                ).map(n => {
                    // "Verein" is a virtual group: active for any of its member pages, and lands
                    // on the first section (Neuigkeiten). Everything else is a plain page tab.
                    const active = n.id === 'verein' ? inVerein : page === n.id
                    const onClick = n.id === 'verein'
                        ? () => { router.navigate({to: `/${VEREIN_SECTIONS[0].id}`}).catch(() => {}) }
                        : () => setPage(n.id as PageId)
                    return (
                        <button key={n.id} className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick}>
                            <n.Icon size={20} strokeWidth={active ? 2.5 : 2}/>
                            <span className="truncate max-w-full">{t(n.labelKey as never)}</span>
                        </button>
                    )
                })}
                {/* Meta footer — desktop rail only (mobile bottom bar has no room). Gives the
                    full-height rail a defined bottom so it doesn't read as empty below the items. */}
                {APP_VERSION && (
                    <div className="app-nav-footer hidden lg:block px-2 pt-3 text-[10px] font-bold text-kce-muted tracking-wide">
                        v{APP_VERSION}
                    </div>
                )}
            </nav>

            <ToastContainer/>
            <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)}/>
            <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)}/>
            <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)}/>
            {vpDebugOpen && <VpDebug onClose={() => setVpDebugOpen(false)}/>}
        </div>
    )
}
