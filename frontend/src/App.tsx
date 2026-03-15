/**
 * Kegelkasse App root — handles auth boot, nav, and page routing.
 * All page components are always mounted (display:none when inactive)
 * to preserve scroll position and avoid re-fetching.
 */
import React, {ReactNode, useEffect} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useAppStore} from './store/app'
import {Locale, useI18n, useT} from './i18n'
import {api, authState} from './api/client'
import {LoginPage} from './pages/LoginPage'
import {AppLogoAnimated} from './components/Logo'
import {ToastContainer} from './components/ui/Toast'
import {OfflineBanner} from './components/ui/OfflineBanner'
import {useActiveEvening} from './hooks/useEvening'
import {usePage} from './hooks/usePage'

// Lazy-loaded page components to keep initial bundle small
import {EveningPage} from './pages/EveningPage'
import {PenaltiesPage} from './pages/PenaltiesPage'
import {GamesPage} from './pages/GamesPage'
import {TreasuryPage} from './pages/TreasuryPage'
import {MembersPage} from './pages/MembersPage'
import {HistoryPage} from './pages/HistoryPage'
import {StatsPage} from './pages/StatsPage'
import {ClubAdminPage} from './pages/ClubAdminPage'

type PageId = 'evening' | 'penalties' | 'games' | 'treasury' | 'members' | 'history' | 'stats' | 'club'

const NAV: { id: PageId; icon: string; labelKey: string }[] = [
    {id: 'penalties', icon: '⚠️', labelKey: 'nav.penalties'},
    {id: 'evening', icon: '🎳', labelKey: 'nav.evening'},
    {id: 'games', icon: '🏆', labelKey: 'nav.games'},
    {id: 'treasury', icon: '💰', labelKey: 'nav.treasury'},
    {id: 'members', icon: '👥', labelKey: 'nav.members'},
    {id: 'history', icon: '📚', labelKey: 'nav.history'},
    {id: 'stats', icon: '📊', labelKey: 'nav.stats'},
    {id: 'club', icon: '⚙️', labelKey: 'nav.club'},
]

export default function App() {
    const {user, setUser, setPenaltyTypes, setRegularMembers, setGameTemplates} = useAppStore()
    const {locale, setLocale} = useI18n()
    const t = useT()
    const [page, setPage] = usePage<PageId>('penalties')
    const {activeEveningId} = useActiveEvening()

    // Boot — verify token, load club data
    useQuery({
        queryKey: ['boot', locale],
        queryFn: async () => {
            if (!authState.isLoggedIn()) return null
            try {
                const u = await api.me()
                setUser(u)
                const [pt, rm, gt] = await Promise.all([
                    api.listPenaltyTypes(),
                    api.listRegularMembers(),
                    api.listGameTemplates(),
                ])
                setPenaltyTypes(pt)
                setRegularMembers(rm)
                setGameTemplates(gt)
                return u
            } catch {
                authState.setToken(null)
                setUser(null)
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

    if (!user) return <LoginPage/>

    return (
        <div style={{display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 640, margin: '0 auto'}}>
            <OfflineBanner/>

            {/* ── Header ── */}
            <header style={{
                flexShrink: 0,
                background: 'linear-gradient(180deg,#080400,#1a1410)',
                borderBottom: '1px solid #3d2e28',
                paddingTop: 'env(safe-area-inset-top, 8px)',
                zIndex: 50,
            }}>
                <div className="flex items-center gap-2.5 px-3 pb-2 pt-1">
                    <AppLogoAnimated size={28}/>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-display font-bold text-kce-amber text-sm leading-tight truncate">
                            {t('app.name')}
                        </h1>
                        <p className="text-[9px] text-kce-muted font-bold tracking-widest">{t('app.subtitle')}</p>
                    </div>
                    {activeEveningId && (
                        <button
                            className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{background: 'rgba(232,160,32,.15)', color: '#e8a020', border: '1px solid #c4701a'}}
                            onClick={() => setPage('evening')}>
                            🎳 Aktiv
                        </button>
                    )}
                    {/* Language toggle */}
                    <div className="flex gap-1 flex-shrink-0">
                        {(['de', 'en'] as const).map(l => (
                            <button key={l} onClick={() => {
                                setLocale(l);
                                api.updateLocale(l).catch(() => {})
                            }}
                                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${locale === l ? 'bg-kce-amber text-kce-bg' : 'text-kce-muted'}`}>
                                {l.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex gap-1 px-2 pb-1.5 mx-1 rounded-xl" style={{background: '#2e2420'}}>
                    {NAV.map(n => (
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
                    ['evening', <EveningPage/>],
                    ['penalties', <PenaltiesPage/>],
                    ['games', <GamesPage/>],
                    ['treasury', <TreasuryPage/>],
                    ['members', <MembersPage/>],
                    ['history', <HistoryPage/>],
                    ['stats', <StatsPage/>],
                    ['club', <ClubAdminPage/>],
                ] as [PageId, ReactNode][]).map(([id, el]) => (
                    <div key={id} style={{position: 'absolute', inset: 0, display: page === id ? 'block' : 'none'}}>
                        {el}
                    </div>
                ))}
            </main>

            <ToastContainer/>
        </div>
    )
}
