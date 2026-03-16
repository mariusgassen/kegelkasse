import {useEffect, useRef, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api, authState} from '@/api/client'
import {useAppStore} from '@/store/app'
import {useI18n, useT} from '@/i18n'
import {showToast} from '@/components/ui/Toast'
import {toastError} from '@/utils/error'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function resizeToBase64(file: File, size = 256): Promise<string> {
    return new Promise(resolve => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = size;
            canvas.height = size
            const ctx = canvas.getContext('2d')!
            const min = Math.min(img.width, img.height)
            const x = (img.width - min) / 2
            const y = (img.height - min) / 2
            ctx.drawImage(img, x, y, min, min, 0, 0, size, size)
            URL.revokeObjectURL(url)
            resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.src = url
    })
}

interface Props {
    open: boolean
    onClose: () => void
}

export function ProfileSheet({open, onClose}: Props) {
    const t = useT()
    const {locale, setLocale} = useI18n()
    const {user, setUser} = useAppStore()
    const fileRef = useRef<HTMLInputElement>(null)

    const [name, setName] = useState(user?.name || '')
    const [username, setUsername] = useState(user?.username || '')
    const [email, setEmail] = useState(() => {
        const e = user?.email || ''
        return e.endsWith('@kegelkasse.internal') ? '' : e
    })
    const [currentPw, setCurrentPw] = useState('')
    const [newPw, setNewPw] = useState('')
    const [saving, setSaving] = useState(false)
    const [avatarLoading, setAvatarLoading] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [pushLoading, setPushLoading] = useState(false)
    const [pushSubscribed, setPushSubscribed] = useState(false)
    const pushSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator
    const [dragY, setDragY] = useState(0)
    const startYRef = useRef(0)
    const isDraggingRef = useRef(false)
    const dragYRef = useRef(0)
    const handleRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) {
            setDragY(0)
            dragYRef.current = 0
        }
    }, [open])

    useEffect(() => {
        const el = handleRef.current
        if (!el) return
        const onStart = (e: TouchEvent) => {
            startYRef.current = e.touches[0].clientY
            isDraggingRef.current = true
        }
        const onMove = (e: TouchEvent) => {
            if (!isDraggingRef.current) return
            e.preventDefault()
            const delta = e.touches[0].clientY - startYRef.current
            if (delta > 0) {
                dragYRef.current = delta;
                setDragY(delta)
            }
        }
        const onEnd = () => {
            isDraggingRef.current = false
            if (dragYRef.current > 80) {
                onClose()
            } else {
                dragYRef.current = 0;
                setDragY(0)
            }
        }
        el.addEventListener('touchstart', onStart, {passive: true})
        el.addEventListener('touchmove', onMove, {passive: false})
        el.addEventListener('touchend', onEnd, {passive: true})
        return () => {
            el.removeEventListener('touchstart', onStart)
            el.removeEventListener('touchmove', onMove)
            el.removeEventListener('touchend', onEnd)
        }
    }, [open, onClose])

    // Check push status when sheet opens
    useEffect(() => {
        if (!open || !pushSupported) return
        navigator.serviceWorker.ready.then(reg =>
            reg.pushManager.getSubscription()
        ).then(sub => setPushSubscribed(!!sub)).catch(() => {})
    }, [open, pushSupported])

    const year = new Date().getFullYear()
    const {data: myStats} = useQuery({
        queryKey: ['my-stats', year],
        queryFn: () => api.getMyStats(year),
        enabled: open && !!user?.regular_member_id,
        staleTime: 1000 * 60 * 5,
    })

    const isFakeEmail = user?.email?.endsWith('@kegelkasse.internal') ?? false

    if (!open) return null

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setAvatarLoading(true)
        try {
            const base64 = await resizeToBase64(file)
            const updated = await api.updateAvatar(base64)
            setUser(updated)
        } catch {
            showToast(t('profile.uploadError'))
        } finally {
            setAvatarLoading(false)
            e.target.value = ''
        }
    }

    async function handleRemoveAvatar() {
        const updated = await api.updateAvatar(null)
        setUser(updated)
    }

    async function save() {
        setSaving(true)
        try {
            const payload: Record<string, string> = {}
            if (name.trim() !== user?.name) payload.name = name.trim()
            if (username.trim() !== (user?.username ?? '')) payload.username = username.trim()
            if (email.trim()) payload.email = email.trim()
            if (newPw) {
                payload.new_password = newPw
                if (currentPw) payload.current_password = currentPw
            }
            if (Object.keys(payload).length) {
                const updated = await api.updateProfile(payload)
                setUser(updated)
            }
            setCurrentPw('');
            setNewPw('')
            showToast(t('club.savedOk'))
            onClose()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function handlePushToggle() {
        if (!pushSupported) return
        setPushLoading(true)
        try {
            const reg = await navigator.serviceWorker.ready
            if (pushSubscribed) {
                const sub = await reg.pushManager.getSubscription()
                if (sub) {
                    await api.unsubscribeFromPush(sub.endpoint)
                    await sub.unsubscribe()
                }
                setPushSubscribed(false)
                showToast('Benachrichtigungen deaktiviert')
            } else {
                const permission = await Notification.requestPermission()
                if (permission !== 'granted') {
                    showToast('Benachrichtigungen wurden nicht erlaubt')
                    return
                }
                const { public_key } = await api.getVapidPublicKey()
                const padding = '='.repeat((4 - public_key.length % 4) % 4)
                const base64 = (public_key + padding).replace(/-/g, '+').replace(/_/g, '/')
                const raw = atob(base64)
                const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
                const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
                const subJson = sub.toJSON()
                await api.subscribeToPush({
                    endpoint: subJson.endpoint!,
                    p256dh: subJson.keys!.p256dh,
                    auth: subJson.keys!.auth,
                })
                setPushSubscribed(true)
                showToast('Benachrichtigungen aktiviert')
            }
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setPushLoading(false)
        }
    }

    const initials = (user?.name || '?')[0].toUpperCase()

    return (
        <div className="bottom-sheet" onClick={e => {
            if (e.target === e.currentTarget) onClose()
        }}>
            <div
                className="sheet-panel safe-bottom"
                style={{
                    transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
                    transition: dragY > 0 ? 'none' : 'transform 0.2s ease',
                }}
            >
                <div
                    ref={handleRef}
                    className="sheet-handle"
                />

                {/* Avatar */}
                <div className="flex flex-col items-center gap-2 mb-5">
                    <div className="relative">
                        <button
                            className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-2xl text-kce-bg flex-shrink-0 active:opacity-80 transition-opacity"
                            style={{background: user?.avatar ? 'transparent' : 'linear-gradient(135deg,#c4701a,var(--kce-primary))'}}
                            onClick={() => fileRef.current?.click()}
                            disabled={avatarLoading}>
                            {user?.avatar
                                ? <img src={user.avatar} alt="" className="w-full h-full object-cover"/>
                                : avatarLoading ? <span className="text-base animate-spin">⟳</span> : initials
                            }
                        </button>
                        <button
                            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                            style={{background: 'var(--kce-primary)', color: 'var(--kce-bg)'}}
                            onClick={() => fileRef.current?.click()}>
                            ✏️
                        </button>
                    </div>
                    <div className="text-center">
                        <div className="font-display font-bold text-kce-cream">{user?.name}</div>
                        {user?.username && <div className="text-xs text-kce-muted">@{user.username}</div>}
                    </div>
                    {user?.avatar && (
                        <button className="text-[10px] text-kce-muted" onClick={handleRemoveAvatar}>
                            {t('profile.removeAvatar')}
                        </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange}/>
                </div>

                {/* Profile form */}
                <div className="flex flex-col gap-3">
                    <div className="kce-card p-4 flex flex-col gap-3">
                        <div>
                            <label className="field-label">{t('profile.displayName')}</label>
                            <input className="kce-input" value={name} onChange={e => setName(e.target.value)}
                                   placeholder={t('profile.displayNamePlaceholder')}/>
                        </div>
                        <div>
                            <label className="field-label">{t('auth.username')}</label>
                            <div className="relative">
                                <span
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-kce-muted text-sm">@</span>
                                <input className="kce-input pl-6" value={username}
                                       onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                                       placeholder={t('auth.usernamePlaceholder')}/>
                            </div>
                        </div>
                        <div>
                            <label className="field-label">{t('profile.loginEmail')}</label>
                            {isFakeEmail && !email && (
                                <p className="text-[10px] text-kce-muted mb-1">{t('profile.noEmail')}</p>
                            )}
                            <input className="kce-input" type="email" value={email}
                                   onChange={e => setEmail(e.target.value)} placeholder={t('profile.emailPlaceholder')}/>
                        </div>
                    </div>

                    <div className="kce-card p-4 flex flex-col gap-3">
                        <div className="text-xs font-bold text-kce-muted uppercase tracking-wider">{t('profile.changePassword')}</div>
                        <div>
                            <label className="field-label">{t('profile.currentPassword')}</label>
                            <input className="kce-input" type="password" value={currentPw}
                                   onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••"/>
                        </div>
                        <div>
                            <label className="field-label">{t('profile.newPassword')}</label>
                            <input className="kce-input" type="password" value={newPw}
                                   onChange={e => setNewPw(e.target.value)} placeholder="••••••••"/>
                        </div>
                    </div>

                    {/* Language */}
                    <div className="kce-card p-4 flex items-center justify-between">
                        <span className="text-xs font-bold text-kce-muted uppercase tracking-wider">{t('settings.language')}</span>
                        <div className="flex gap-1">
                            {(['de', 'en'] as const).map(l => (
                                <button key={l} onClick={() => {
                                    setLocale(l);
                                    api.updateLocale(l).catch(() => {
                                    })
                                }}
                                        className={`text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all ${locale === l ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}>
                                    {l.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Push notifications */}
                    {pushSupported && (
                        <div className="kce-card p-4 flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-kce-muted uppercase tracking-wider">Benachrichtigungen</span>
                                {pushSubscribed && <div className="text-[10px] text-green-400 mt-0.5">Aktiv auf diesem Gerät</div>}
                            </div>
                            <button
                                onClick={handlePushToggle}
                                disabled={pushLoading}
                                className={`text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all ${pushSubscribed ? 'bg-kce-surface2 text-kce-muted' : 'bg-kce-amber text-kce-bg'}`}>
                                {pushLoading ? '…' : pushSubscribed ? 'Deaktivieren' : 'Aktivieren'}
                            </button>
                        </div>
                    )}

                    {/* Personal year stats */}
                    {myStats && (
                        <div className="kce-card p-4">
                            <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-3">
                                {t('profile.myStats')} {year}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="text-center">
                                    <div
                                        className="font-display font-bold text-red-400 text-lg">{fe(myStats.penalty_total)}</div>
                                    <div className="text-[9px] text-kce-muted uppercase tracking-wider">{t('profile.penalties')}</div>
                                </div>
                                <div className="text-center">
                                    <div
                                        className="font-display font-bold text-kce-cream text-lg">{myStats.evenings_attended}/{myStats.total_evenings}</div>
                                    <div className="text-[9px] text-kce-muted uppercase tracking-wider">{t('profile.evenings')}</div>
                                </div>
                                <div className="text-center">
                                    <div
                                        className="font-display font-bold text-kce-amber text-lg">{myStats.game_wins}</div>
                                    <div className="text-[9px] text-kce-muted uppercase tracking-wider">{t('profile.wins')}</div>
                                </div>
                                <div className="text-center">
                                    <div
                                        className="font-display font-bold text-kce-cream text-lg">🍺 {myStats.beer_rounds}</div>
                                    <div className="text-[9px] text-kce-muted uppercase tracking-wider">{t('profile.beerRounds')}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <button className="btn-primary w-full" disabled={saving} onClick={save}>
                        {saving ? t('action.saving') : t('action.save')}
                    </button>
                    <a
                        href="/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kce-card p-3 flex items-center justify-between text-sm text-kce-cream no-underline active:opacity-70 transition-opacity"
                    >
                        <span>{t('profile.docs')}</span>
                        <span className="text-kce-muted text-xs">↗</span>
                    </a>
                    <button className="btn-danger w-full py-2.5 text-sm" onClick={() => {
                        authState.setToken(null)
                        setUser(null)
                    }}>
                        {t('auth.logout')}
                    </button>

                    {/* Account delete */}
                    {!confirmDelete ? (
                        <button className="text-[11px] text-kce-muted text-center py-1 w-full"
                                onClick={() => setConfirmDelete(true)}>
                            {t('profile.deleteAccount')}
                        </button>
                    ) : (
                        <div className="kce-card p-3 flex flex-col gap-2 border border-red-900/40">
                            <p className="text-xs text-center text-kce-cream">{t('profile.deleteConfirm')}</p>
                            <div className="flex gap-2">
                                <button className="btn-secondary flex-1 btn-sm"
                                        onClick={() => setConfirmDelete(false)}>{t('action.cancel')}
                                </button>
                                <button className="btn-danger flex-1 btn-sm" onClick={async () => {
                                    await api.deleteAccount()
                                    authState.setToken(null)
                                    setUser(null)
                                }}>{t('action.confirmDelete')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
