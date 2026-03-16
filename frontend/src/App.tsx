/**
 * Kegelkasse App root — handles auth boot, nav, and page routing.
 * All page components are always mounted (display:none when inactive)
 * to preserve scroll position and avoid re-fetching.
 */
import React, {ReactNode, useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useAppStore} from './store/app'
import {Locale, useI18n, useT, t as tI18n} from './i18n'
import {api, authState, NetworkError, UnauthorizedError} from './api/client'
import {LoginPage} from './pages/LoginPage'
import {AppLogoAnimated} from './components/Logo'
import {ToastContainer, showToast} from './components/ui/Toast'
import {OfflineBanner} from './components/ui/OfflineBanner'
import {useActiveEvening} from './hooks/useEvening'
import {usePage} from './hooks/usePage'
import {ProfileSheet} from './components/ProfileSheet'

// Lazy-loaded page components to keep initial bundle small
import {EveningHubPage} from './pages/EveningHubPage'
import {EveningPage} from './pages/EveningPage'
import {TreasuryPage} from './pages/TreasuryPage'
import {HistoryPage} from './pages/HistoryPage'
import {StatsPage} from './pages/StatsPage'
import {ClubAdminPage} from './pages/ClubAdminPage'

type PageId = 'evening' | 'config' | 'treasury' | 'history' | 'stats' | 'club'

function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0
    const l = (max + min) / 2
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break
            case g:
                h = ((b - r) / d + 2) / 6;
                break
            case b:
                h = ((r - g) / d + 4) / 6;
                break
        }
    }
    return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
    h /= 360;
    s /= 100;
    l /= 100
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    let r, g, b
    if (s === 0) {
        r = g = b = l
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3)
    }
    return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')
}

function applyBgDerivations(bg: string) {
    const root = document.documentElement
    const [h, s, l] = hexToHsl(bg)
    const dark = l < 50
    // surface tones — always step away from bg
    const step = dark ? 1 : -1
    root.style.setProperty('--kce-surface', hslToHex(h, s, l + step * 4))
    root.style.setProperty('--kce-surface2', hslToHex(h, s, l + step * 8))
    root.style.setProperty('--kce-border', hslToHex(h, s, l + step * 16))
    // text colors — contrast against bg
    const textL = dark ? 90 : 10
    const mutedL = dark ? 45 : 55
    root.style.setProperty('--kce-cream', hslToHex(h, Math.min(s * 0.6, 40), textL))
    root.style.setProperty('--kce-muted', hslToHex(h, Math.min(s * 0.3, 20), mutedL))
}

export function applyClubTheme(club: {
    settings?: { primary_color?: string | null; secondary_color?: string | null; bg_color?: string | null } | null
} | null) {
    const root = document.documentElement
    if (club?.settings?.primary_color) root.style.setProperty('--kce-primary', club.settings.primary_color)
    if (club?.settings?.secondary_color) root.style.setProperty('--kce-secondary', club.settings.secondary_color)
    if (club?.settings?.bg_color) {
        root.style.setProperty('--kce-bg', club.settings.bg_color)
        applyBgDerivations(club.settings.bg_color)
    }
}

const NAV: { id: PageId; icon: string; labelKey: string }[] = [
    {id: 'evening', icon: '🎳', labelKey: 'nav.evening'},
    {id: 'treasury', icon: '💰', labelKey: 'nav.treasury'},
    {id: 'history', icon: '📚', labelKey: 'nav.history'},
    {id: 'stats', icon: '📊', labelKey: 'nav.stats'},
    {id: 'club', icon: '⚙️', labelKey: 'nav.club'},
]

export default function App() {
    const {
        user,
        setUser,
        setPenaltyTypes,
        setRegularMembers,
        setGameTemplates,
        setGuestPenaltyCap,
        activeEveningId,
        setActiveEveningId
    } = useAppStore()
    const {locale, setLocale} = useI18n()
    const t = useT()
    const NAV_PAGES: PageId[] = ['evening', 'config', 'treasury', 'history', 'stats', 'club']
    const [page, setPage] = usePage<PageId>('evening', NAV_PAGES)
    const [profileOpen, setProfileOpen] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    // Boot states: 'loading' while token is being verified, 'network-error' if server unreachable
    const [bootDone, setBootDone] = useState(!authState.isLoggedIn())
    const [bootNetworkError, setBootNetworkError] = useState(false)
    const queryClient = useQueryClient()
    useActiveEvening()

    // Register global 401 handler — auto-logout when any request returns Unauthorized.
    // The toast is suppressed here; the UnauthorizedError message surfaces through
    // catch blocks in event handlers. For background queries it's shown via the
    // session-expired toast below.
    useEffect(() => {
        return authState.onUnauthorized(() => {
            const wasLoggedIn = !!useAppStore.getState().user
            authState.setToken(null)
            useAppStore.getState().setUser(null)
            if (wasLoggedIn) showToast(tI18n('error.session'), 'error')
        })
    }, [])

    async function handleRefresh() {
        setRefreshing(true)
        await queryClient.invalidateQueries()
        setRefreshing(false)
    }

    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, enabled: !!user, staleTime: 60000})

    // Boot — verify token, load club data
    const {refetch: retryBoot} = useQuery({
        queryKey: ['boot', locale],
        queryFn: async () => {
            if (!authState.isLoggedIn()) {
                setBootDone(true)
                return null
            }
            try {
                const u = await api.me()
                setUser(u)
                const [pt, rm, gt, club] = await Promise.all([
                    api.listPenaltyTypes(),
                    api.listRegularMembers(),
                    api.listGameTemplates(),
                    api.getClub(),
                ])
                setPenaltyTypes(pt)
                setRegularMembers(rm)
                setGameTemplates(gt)
                setGuestPenaltyCap(club.settings?.guest_penalty_cap ?? null)
                applyClubTheme(club)
                // Auto-select the single open evening for new/other-device users
                if (!activeEveningId) {
                    const evenings = await api.listEvenings()
                    const open = evenings.filter((e: any) => !e.is_closed)
                    if (open.length === 1) setActiveEveningId(open[0].id)
                }
                setBootNetworkError(false)
                setBootDone(true)
                return u
            } catch (e) {
                if (e instanceof NetworkError) {
                    // Server unreachable — keep token, show retry screen
                    setBootNetworkError(true)
                    setBootDone(true)
                } else {
                    // Auth error (401 fires via onUnauthorized) or other — clear session
                    if (!(e instanceof UnauthorizedError)) {
                        authState.setToken(null)
                        setUser(null)
                    }
                    setBootDone(true)
                }
                return null
            }
        },
        staleTime: Infinity,
        retry: false,
    })

    // Apply preferred locale from user profile
    useEffect(() => {
        if (user?.preferred_locale) {
            setLocale(user.preferred_locale as Locale)
        }
    }, [user?.preferred_locale])

    // ── Loading splash ──
    if (!bootDone) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4"
                 style={{background: 'var(--kce-bg)'}}>
                <AppLogoAnimated size={64}/>
                <p className="text-kce-muted text-xs font-bold tracking-widest animate-pulse">
                    {t('error.connecting')}
                </p>
            </div>
        )
    }

    // ── Boot network error (has token but server unreachable) ──
    if (bootNetworkError && !user) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6"
                 style={{background: 'var(--kce-bg)'}}>
                <AppLogoAnimated size={64}/>
                <div className="text-center">
                    <p className="text-kce-cream font-bold text-sm mb-1">📡 {t('error.serverDown')}</p>
                    <p className="text-kce-muted text-xs">{t('error.network')}</p>
                </div>
                <button className="btn-primary px-6" onClick={() => {
                    setBootNetworkError(false)
                    setBootDone(false)
                    retryBoot()
                }}>
                    {t('error.retry')}
                </button>
            </div>
        )
    }

    if (!user) return <LoginPage/>

    return (
        <div style={{display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 640, margin: '0 auto'}}>
            <OfflineBanner/>

            {/* ── Header ── */}
            <header style={{
                flexShrink: 0,
                background: 'linear-gradient(180deg, var(--kce-bg), var(--kce-bg))',
                borderBottom: '1px solid #3d2e28',
                paddingTop: 'env(safe-area-inset-top, 8px)',
                zIndex: 50,
            }}>
                <div className="flex items-center gap-2.5 px-3 pb-2 pt-1">
                    <AppLogoAnimated size={28}/>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-display font-bold text-kce-amber text-sm leading-tight truncate">
                            {club?.name || t('app.name')}
                        </h1>
                        <p className="text-[9px] text-kce-muted font-bold tracking-widest">{t('app.subtitle')}</p>
                    </div>
                    {activeEveningId && (
                        <button
                            className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{background: 'rgba(232,160,32,.15)', color: '#e8a020', border: '1px solid #c4701a'}}
                            onClick={() => setPage('config')}>
                            🎳 {t('evening.active')}
                        </button>
                    )}
                    {/* Refresh button */}
                    <button
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity"
                        style={{background: 'rgba(255,255,255,0.07)', color: 'var(--kce-muted)'}}
                        onClick={handleRefresh}
                        disabled={refreshing}>
                        <span style={{
                            display: 'inline-block',
                            fontSize: 14,
                            transition: 'transform 0.6s ease',
                            transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)',
                        }}>↻</span>
                    </button>
                    {/* Avatar button */}
                    <button
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

                {/* Nav */}
                <nav className="flex items-stretch gap-1 px-2 mx-1 rounded-xl" style={{background: '#2e2420'}}>
                    {NAV.filter(n => n.id !== 'club' || user?.role === 'admin' || user?.role === 'superadmin').map(n => (
                        <button key={n.id} className={`nav-btn ${page === n.id ? 'active' : ''}`}
                                onClick={() => setPage(n.id)}>
                            <span className="icon">{n.icon}</span>
                            <span className="truncate max-w-full">{t(n.labelKey as any)}</span>
                        </button>
                    ))}
                </nav>
            </header>

            {/* ── Pages (all mounted, toggled via display) ── */}
            <main style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
                {([
                    ['evening', <EveningHubPage onNavigate={() => setPage('config')}/>],
                    ['config', <EveningPage/>],
                    ['treasury', <TreasuryPage/>],
                    ['history', <HistoryPage onNavigate={() => setPage('evening')}/>],
                    ['stats', <StatsPage/>],
                    ['club', <ClubAdminPage/>],
                ] as [PageId, ReactNode][]).map(([id, el]) => (
                    <div key={id} style={{position: 'absolute', inset: 0, display: page === id ? 'block' : 'none'}}>
                        {el}
                    </div>
                ))}
            </main>

            <ToastContainer/>
            <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)}/>
        </div>
    )
}
