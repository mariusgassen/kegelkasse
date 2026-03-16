import {useEffect, useState} from 'react'
import {api, authState} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {useI18n, useT} from '@/i18n'
import {AppLogo} from '@/components/Logo.tsx'
import {clearAuthParams} from '@/hooks/usePage.ts'

export function LoginPage() {
    const [email, setEmail] = useState('')
    const [pw, setPw] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
    const [inviteToken, setInviteToken] = useState('')
    const [name, setName] = useState('')
    const [username, setUsername] = useState('')
    const [prefilledName, setPrefilledName] = useState<string | null>(null)
    const [resetToken, setResetToken] = useState('')
    const [resetDone, setResetDone] = useState(false)
    const setUser = useAppStore(s => s.setUser)
    const t = useT()
    const {setLocale, locale} = useI18n()

    // Auto-fill token from URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const invite = params.get('token')
        const reset = params.get('reset')
        if (invite) {
            setInviteToken(invite)
            setMode('register')
            api.getInviteInfo(invite).then(info => {
                if (info.member_name) setPrefilledName(info.member_name)
            }).catch(() => {})
        } else if (reset) {
            setResetToken(reset)
            setMode('reset')
        }
    }, [])

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true)
        try {
            const res = await api.login(email, pw)
            authState.setToken(res.access_token)
            clearAuthParams()
            setUser(res.user)
            if (res.user.preferred_locale) setLocale(res.user.preferred_locale as any)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : t('auth.error.invalid'))
        } finally {
            setLoading(false)
        }
    }

    async function handleDevLogin() {
        setError('');
        setLoading(true)
        try {
            const res = await api.login(
                import.meta.env.VITE_DEV_EMAIL ?? 'admin@kegelkasse.de',
                import.meta.env.VITE_DEV_PASSWORD ?? 'change_after_first_login',
            )
            authState.setToken(res.access_token)
            clearAuthParams()
            setUser(res.user)
            if (res.user.preferred_locale) setLocale(res.user.preferred_locale as any)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : t('auth.error.invalid'))
        } finally {
            setLoading(false)
        }
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true)
        try {
            const res = await api.register(inviteToken, pw, username, prefilledName ? undefined : name)
            authState.setToken(res.access_token)
            clearAuthParams()
            setUser(res.user)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setLoading(false)
        }
    }

    async function handleReset(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true)
        try {
            await api.resetPassword(resetToken, pw)
            clearAuthParams()
            setResetDone(true)
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : t('auth.reset.invalid'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
             style={{background: 'linear-gradient(160deg,#1a1410 0%,#241c18 60%,#2a1e18 100%)'}}>
            {/* Language toggle */}
            <div className="absolute top-4 right-4 flex gap-1">
                {(['de', 'en'] as const).map(l => (
                    <button key={l} onClick={() => setLocale(l)}
                            className={`text-xs font-bold px-2 py-1 rounded ${locale === l ? 'bg-kce-amber text-kce-bg' : 'text-kce-muted'}`}>
                        {l.toUpperCase()}
                    </button>
                ))}
            </div>

            {/* Logo */}
            <div className="mb-6 flex flex-col items-center gap-3">
                <AppLogo size={80}/>
                <div className="text-center">
                    <h1 className="font-display font-bold text-kce-amber text-2xl leading-tight">{t('app.name')}</h1>
                    <p className="text-kce-muted text-xs font-bold tracking-widest mt-0.5">{t('app.subtitle')}</p>
                </div>
            </div>

            <div className="kce-card w-full max-w-sm p-6">
                {mode === 'login' ? (
                    <>
                        <h2 className="font-display font-bold text-kce-cream text-lg mb-5">{t('auth.login')}</h2>
                        <form onSubmit={handleLogin} className="flex flex-col gap-3">
                            <div>
                                <label className="field-label">{t('auth.email')} / Username</label>
                                <input className="kce-input"
                                       value={email}
                                       onChange={e => setEmail(e.target.value)}
                                       placeholder="name@example.de oder @username" required/>
                            </div>
                            <div>
                                <label className="field-label">{t('auth.password')}</label>
                                <input className="kce-input" type="password"
                                       value={pw}
                                       onChange={e => setPw(e.target.value)}
                                       placeholder="••••••••" required/>
                            </div>
                            {error && <p className="text-red-400 text-xs">{error}</p>}
                            <button type="submit" className="btn-primary mt-1" disabled={loading}>
                                {loading ? t('action.loading') : t('auth.loginButton')}
                            </button>
                        </form>
                        <p className="text-center text-kce-muted text-xs mt-4">
                            {t('auth.haveInvite')}{' '}
                            <button onClick={() => setMode('register')}
                                    className="text-kce-amber font-bold">{t('auth.clickHere')}</button>
                        </p>
                        {import.meta.env.DEV && (
                            <button type="button" onClick={handleDevLogin} disabled={loading}
                                    className="mt-3 w-full text-xs py-1.5 rounded border border-dashed border-kce-muted text-kce-muted hover:border-kce-amber hover:text-kce-amber transition-colors">
                                ⚡ Dev Login
                            </button>
                        )}
                    </>
                ) : mode === 'reset' ? (
                    <>
                        <h2 className="font-display font-bold text-kce-cream text-lg mb-4">{t('auth.reset.title')}</h2>
                        {resetDone ? (
                            <>
                                <p className="text-green-400 text-sm mb-4">{t('auth.reset.success')}</p>
                                <button className="btn-primary w-full" onClick={() => { setMode('login'); setResetDone(false) }}>
                                    {t('auth.login')}
                                </button>
                            </>
                        ) : (
                            <form onSubmit={handleReset} className="flex flex-col gap-3">
                                <div>
                                    <label className="field-label">{t('auth.password')}</label>
                                    <input className="kce-input" type="password" value={pw}
                                           onChange={e => setPw(e.target.value)} placeholder="••••••••" required autoFocus/>
                                </div>
                                {error && <p className="text-red-400 text-xs">{error}</p>}
                                <button type="submit" className="btn-primary mt-1" disabled={loading}>
                                    {loading ? t('action.loading') : t('auth.reset.button')}
                                </button>
                            </form>
                        )}
                        <p className="text-center text-kce-muted text-xs mt-4">
                            <button onClick={() => setMode('login')} className="text-kce-amber font-bold">
                                ← {t('auth.login')}
                            </button>
                        </p>
                    </>
                ) : (
                    <>
                        <h2 className="font-display font-bold text-kce-cream text-lg mb-1">{t('auth.register.title')}</h2>
                        {prefilledName && (
                            <p className="text-kce-muted text-xs mb-4">
                                Willkommen, <span className="text-kce-cream font-bold">{prefilledName}</span>! Wähle ein Passwort.
                            </p>
                        )}
                        <form onSubmit={handleRegister} className="flex flex-col gap-3">
                            {!prefilledName && (
                                <>
                                    <div>
                                        <label className="field-label">Einladungs-Token</label>
                                        <input className="kce-input" value={inviteToken}
                                               onChange={e => setInviteToken(e.target.value)}
                                               placeholder="aus dem Einladungslink" required/>
                                    </div>
                                    <div>
                                        <label className="field-label">{t('auth.name')}</label>
                                        <input className="kce-input" value={name} onChange={e => setName(e.target.value)}
                                               placeholder="Dein Name" required/>
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="field-label">Username</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kce-muted text-sm">@</span>
                                    <input className="kce-input pl-6" value={username}
                                           onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                                           placeholder="username" autoFocus={!!prefilledName} required/>
                                </div>
                            </div>
                            <div>
                                <label className="field-label">{t('auth.password')}</label>
                                <input className="kce-input" type="password" value={pw}
                                       onChange={e => setPw(e.target.value)} placeholder="••••••••" required/>
                            </div>
                            {error && <p className="text-red-400 text-xs">{error}</p>}
                            <button type="submit" className="btn-primary mt-1" disabled={loading}>
                                {loading ? t('action.loading') : t('auth.register.button')}
                            </button>
                        </form>
                        <p className="text-center text-kce-muted text-xs mt-4">
                            <button onClick={() => setMode('login')}
                                    className="text-kce-amber font-bold">← {t('auth.login')}</button>
                        </p>
                    </>
                )}
            </div>

            <p className="text-kce-muted text-[10px] mt-6 italic tracking-wider">{t('app.motto')}</p>
        </div>
    )
}
