/**
 * Kegelkasse App root — owns the auth boot/login/splash flow and the club theme.
 * Once authenticated it mounts the TanStack Router (#64); the shell (header, nav, overlays)
 * lives in RootLayout, and each page is a code-split route.
 */
import {useEffect, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {RouterProvider} from '@tanstack/react-router'
import {useAppStore} from './store/app'
import {useThemeStore, type Theme} from './store/theme'
import {Locale, useI18n, useT, t as tI18n} from './i18n'
import {api, authState, NetworkError, UnauthorizedError} from './api/client'
import {LoginPage} from './pages/LoginPage'
import {AppLogoAnimated} from './components/Logo'
import {showToast} from './components/ui/Toast'
import {useActiveEvening} from './hooks/useEvening'
import {useNotificationStore} from './store/notifications'
import {router} from './router'
import {WifiOff} from 'lucide-react'

export function hexToHsl(hex: string): [number, number, number] {
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

export function hslToHex(h: number, s: number, l: number): string {
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

const DEFAULT_DARK_BG = '#1a1410'

/** Resolves 'system' against the OS preference; 'dark'/'light' pass through unchanged. */
export function resolveEffectiveMode(theme: Theme): 'dark' | 'light' {
    if (theme !== 'system') return theme
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** Mirrors a bg color's lightness for light mode while keeping its hue/saturation (brand identity) intact. */
export function resolveThemedBg(baseBg: string, mode: 'dark' | 'light'): string {
    if (mode === 'dark') return baseBg
    const [h, s, l] = hexToHsl(baseBg)
    return hslToHex(h, s, Math.max(100 - l, 85))
}

/** Theme-aware wrapper around applyClubTheme — applyClubTheme itself stays a raw, unmodified pass-through
 *  (used by ClubAdminPage's brand-color live preview, which must always preview the true configured color). */
export function applyTheme(club: Parameters<typeof applyClubTheme>[0], theme: Theme) {
    const baseBg = club?.settings?.bg_color ?? DEFAULT_DARK_BG
    const bg = resolveThemedBg(baseBg, resolveEffectiveMode(theme))
    applyClubTheme({settings: {...club?.settings, bg_color: bg}})
}

export default function App() {
    const {
        user,
        setUser,
        setPenaltyTypes,
        setRegularMembers,
        setGameTemplates,
        setGuestPenaltyCap,
        setActiveEveningId
    } = useAppStore()
    const {locale, setLocale} = useI18n()
    const theme = useThemeStore(s => s.theme)
    const t = useT()
    const {addNotification} = useNotificationStore()
    // Boot states: 'loading' while token is being verified, 'network-error' if server unreachable
    const [bootDone, setBootDone] = useState(!authState.isLoggedIn())
    const [bootNetworkError, setBootNetworkError] = useState(false)
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

    // Listen for push messages broadcast from the service worker
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'push-received') {
                const {title, body, url} = event.data
                addNotification({title, body, url: url ?? '/'})
            }
        }
        navigator.serviceWorker.addEventListener('message', handler)
        return () => navigator.serviceWorker.removeEventListener('message', handler)
    }, [addNotification])

    // On boot, read any push notifications missed while the app was closed (stored in IndexedDB by SW)
    useEffect(() => {
        const req = indexedDB.open('kegelkasse_notifications', 1)
        req.onsuccess = () => {
            const db = req.result
            if (!db.objectStoreNames.contains('missed')) { db.close(); return }
            const tx = db.transaction('missed', 'readwrite')
            const store = tx.objectStore('missed')
            const allReq = store.getAll()
            allReq.onsuccess = () => {
                const items = allReq.result as {title: string; body: string; url: string}[]
                items.forEach(n => addNotification({title: n.title, body: n.body, url: n.url ?? '/'}))
                if (items.length > 0) store.clear()
            }
            tx.oncomplete = () => db.close()
            tx.onerror = () => db.close()
        }
        req.onerror = () => {}
    }, [addNotification])

    // Hybrid: fetch unread notifications from server — on boot and every 30 s
    useEffect(() => {
        if (!user) return
        function fetchNotifications() {
            api.getRecentNotifications().then((items) => {
                items.forEach(n => addNotification({
                    title: n.title,
                    body: n.body,
                    url: n.url ?? '/',
                    serverLogId: n.id,
                    serverCreatedAt: n.created_at,
                }))
            }).catch(() => {})
        }
        fetchNotifications()
        const timer = setInterval(fetchNotifications, 30_000)
        return () => clearInterval(timer)
    }, [user?.id, addNotification])

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
                applyTheme(club, useThemeStore.getState().theme)
                // Validate persisted activeEveningId and auto-select if needed
                const evenings = await api.listEvenings()
                const open = evenings.filter((e: any) => !e.is_closed)
                const currentActiveId = useAppStore.getState().activeEveningId
                if (currentActiveId) {
                    // Clear stale ID if evening no longer exists or is already closed
                    const stillOpen = open.find((e: any) => e.id === currentActiveId)
                    if (!stillOpen) setActiveEveningId(null)
                } else if (open.length === 1) {
                    setActiveEveningId(open[0].id)
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

    // Apply club theme whenever club data or the user's light/dark/system preference changes;
    // in 'system' mode also react to the OS-level prefers-color-scheme flipping without a reload.
    useEffect(() => {
        if (!club) return
        applyTheme(club, theme)
        if (theme !== 'system') return
        const mq = window.matchMedia('(prefers-color-scheme: light)')
        const handler = () => applyTheme(club, theme)
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [club, theme])

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
                    <p className="text-kce-cream font-bold text-sm mb-1 flex items-center justify-center gap-2">
                        <WifiOff size={16} strokeWidth={2}/> {t('error.serverDown')}
                    </p>
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

    if (!user) return <LoginPage onLogin={() => retryBoot()} />

    // Authenticated — mount the router; RootLayout renders the shell around the active page.
    return <RouterProvider router={router}/>
}
