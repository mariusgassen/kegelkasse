import {useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState} from '@/api/client'
import {useAppStore} from '@/store/app'
import {useI18n, useT} from '@/i18n'
import {showToast} from '@/components/ui/Toast'
import {toastError} from '@/utils/error'
import {PushPreferences} from '@/types'

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
    const {user, setUser, regularMembers} = useAppStore()
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
    const [pushTesting, setPushTesting] = useState(false)
    const [pushSubscribed, setPushSubscribed] = useState(false)
    const [pushConfigured, setPushConfigured] = useState(false)
    const pushSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator
    const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isStandalone = typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
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

    const [pushPrefs, setPushPrefs] = useState<PushPreferences | null>(null)

    // Check push status when sheet opens
    useEffect(() => {
        if (!open || !pushSupported) return
        navigator.serviceWorker.ready.then(reg =>
            reg.pushManager.getSubscription()
        ).then(sub => setPushSubscribed(!!sub)).catch(() => {})
        api.getPushStatus().then(s => setPushConfigured(s.configured)).catch(() => {})
    }, [open, pushSupported])

    // Load push preferences when subscribed
    useEffect(() => {
        if (!open || !pushSubscribed) return
        api.getPushPreferences().then(setPushPrefs).catch(() => {})
    }, [open, pushSubscribed])

    async function togglePushPref(key: keyof PushPreferences) {
        if (!pushPrefs) return
        const updated = {...pushPrefs, [key]: !pushPrefs[key]}
        setPushPrefs(updated)
        try {
            await api.updatePushPreferences({[key]: updated[key]})
        } catch (e) {
            setPushPrefs(pushPrefs) // revert
            toastError(e)
        }
    }

    const qc = useQueryClient()
    const year = new Date().getFullYear()
    const {data: myStats} = useQuery({
        queryKey: ['my-stats', year],
        queryFn: () => api.getMyStats(year),
        enabled: open && !!user?.regular_member_id,
        staleTime: 1000 * 60 * 5,
    })

    const {data: myBalance} = useQuery({
        queryKey: ['my-balance'],
        queryFn: api.getMyBalance,
        enabled: open && !!user?.regular_member_id,
        staleTime: 1000 * 30,
    })

    const {data: myRequests = [], refetch: refetchRequests} = useQuery({
        queryKey: ['my-payment-requests'],
        queryFn: api.getMyPaymentRequests,
        enabled: open && !!user?.regular_member_id,
        staleTime: 1000 * 30,
    })

    const {data: club} = useQuery({
        queryKey: ['club'],
        queryFn: api.getClub,
        enabled: open,
        staleTime: 1000 * 60,
    })

    const [reportingPayment, setReportingPayment] = useState(false)
    const [paymentAmount, setPaymentAmount] = useState('')

    const paypalHandle = club?.settings?.paypal_me
    const debtAmount = myBalance?.balance != null && myBalance.balance < 0 ? Math.abs(myBalance.balance) : 0
    const hasDebt = debtAmount > 0
    const hasPendingRequest = myRequests.some(r => r.status === 'pending')

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

    const linkedMember = regularMembers.find(m => m.id === user?.regular_member_id)
    const displayName = linkedMember?.nickname || user?.name || '?'
    const initials = displayName[0].toUpperCase()

    return (
        <div className="bottom-sheet" role="dialog" aria-modal="true" onClick={e => {
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
                        <div className="font-display font-bold text-kce-cream">{displayName}</div>
                        {linkedMember?.nickname && <div className="text-xs text-kce-muted">{user?.name}</div>}
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
                    {pushConfigured && (pushSupported ? (
                        <div className="kce-card p-4 flex items-center justify-between">
                            <div>
                                <span className="text-xs font-bold text-kce-muted uppercase tracking-wider">{t('push.label')}</span>
                                {pushSubscribed && <div className="text-[10px] text-green-400 mt-0.5">{t('push.activeOnDevice')}</div>}
                            </div>
                            <div className="flex gap-2 items-center">
                                {pushSubscribed && (
                                    <button
                                        onClick={async () => {
                                            setPushTesting(true)
                                            try {
                                                await api.testPush()
                                                showToast('Test-Benachrichtigung gesendet')
                                            } catch (e: unknown) {
                                                showToast(e instanceof Error ? e.message : 'Fehler beim Senden')
                                            } finally {
                                                setPushTesting(false)
                                            }
                                        }}
                                        disabled={pushTesting}
                                        className="text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all bg-kce-surface2 text-kce-muted">
                                        {pushTesting ? '…' : 'Test'}
                                    </button>
                                )}
                                <button
                                    onClick={handlePushToggle}
                                    disabled={pushLoading}
                                    className={`text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all ${pushSubscribed ? 'bg-kce-surface2 text-kce-muted' : 'bg-kce-amber text-kce-bg'}`}>
                                    {pushLoading ? '…' : pushSubscribed ? t('push.deactivate') : t('push.activate')}
                                </button>
                            </div>
                        </div>
                    ) : isIos && !isStandalone ? (
                        <div className="kce-card p-4">
                            <span className="text-xs font-bold text-kce-muted uppercase tracking-wider">{t('push.iosInstallTitle')}</span>
                            <p className="text-xs text-kce-muted mt-1.5 mb-2">{t('push.iosInstallHint')}</p>
                            <div className="flex gap-3 text-xs text-kce-muted">
                                <span>{t('push.iosInstallStep1')}</span>
                                <span className="text-kce-muted opacity-40">→</span>
                                <span>{t('push.iosInstallStep2')}</span>
                            </div>
                        </div>
                    ) : null)}

                    {/* Push notification preferences */}
                    {pushSubscribed && pushPrefs && (
                        <div className="kce-card p-4 space-y-2">
                            <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-3">
                                {t('push.preferences')}
                            </div>
                            {(Object.keys(pushPrefs) as (keyof PushPreferences)[]).map(key => (
                                <div key={key} className="flex items-center justify-between py-0.5">
                                    <span className="text-xs text-kce-cream">{t(`push.pref.${key}` as any)}</span>
                                    <button
                                        onClick={() => togglePushPref(key)}
                                        className={[
                                            'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                                            pushPrefs[key] ? 'bg-kce-amber' : 'bg-kce-surface2',
                                        ].join(' ')}
                                        aria-pressed={pushPrefs[key]}
                                    >
                                        <span className={[
                                            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                                            pushPrefs[key] ? 'translate-x-4' : 'translate-x-0.5',
                                        ].join(' ')}/>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Balance & payment link */}
                    {myBalance?.balance != null && (
                        <div className="kce-card p-4">
                            <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-3">
                                {t('profile.myBalance')}
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs text-kce-muted">{t('profile.balance')}</span>
                                <span className={`font-display font-bold text-xl ${myBalance.balance < -0.01 ? 'text-red-400' : myBalance.balance > 0.01 ? 'text-green-400' : 'text-kce-muted'}`}>
                                    {myBalance.balance.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}
                                </span>
                            </div>
                            {hasDebt && paypalHandle && !hasPendingRequest && (
                                <div className="flex flex-col gap-2">
                                    {!reportingPayment ? (
                                        <div className="flex gap-2">
                                            <a
                                                href={`https://paypal.me/${paypalHandle}/${debtAmount.toFixed(2)}EUR`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn-primary flex-1 text-center text-sm py-2"
                                            >
                                                {t('profile.payNow')}
                                            </a>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                                                <input
                                                    className="kce-input flex-1"
                                                    type="text" inputMode="decimal"
                                                    value={paymentAmount}
                                                    placeholder={debtAmount.toFixed(2)}
                                                    onChange={e => setPaymentAmount(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button className="btn-secondary flex-1 btn-sm"
                                                        onClick={() => { setReportingPayment(false); setPaymentAmount('') }}>
                                                    {t('action.cancel')}
                                                </button>
                                                <button className="btn-primary flex-1 btn-sm" onClick={async () => {
                                                    const amt = paymentAmount.trim()
                                                        ? parseFloat(paymentAmount.replace(',', '.'))
                                                        : debtAmount
                                                    if (!amt || amt <= 0) return
                                                    try {
                                                        await api.createPaymentRequest({amount: amt})
                                                        await refetchRequests()
                                                        qc.invalidateQueries({queryKey: ['payment-requests']})
                                                        qc.invalidateQueries({queryKey: ['my-balance']})
                                                        setReportingPayment(false)
                                                        setPaymentAmount('')
                                                        showToast(t('profile.reportPayment'))
                                                    } catch (e) { toastError(e) }
                                                }}>
                                                    {t('profile.reportPayment')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {!reportingPayment && (
                                        <button className="btn-secondary w-full text-sm" onClick={() => setReportingPayment(true)}>
                                            {t('profile.reportPayment')}
                                        </button>
                                    )}
                                </div>
                            )}
                            {hasPendingRequest && (
                                <div className="text-xs text-kce-amber text-center py-1">
                                    ⏳ {t('paymentRequest.pending')}
                                </div>
                            )}
                            {myRequests.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-kce-surface2">
                                    <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-2">
                                        {t('profile.paymentRequests')}
                                    </div>
                                    {myRequests.map(r => (
                                        <div key={r.id} className="flex items-center justify-between py-1 text-xs">
                                            <span className="text-kce-muted">
                                                {r.created_at ? new Date(r.created_at).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'}) : ''}
                                            </span>
                                            <span className="font-bold">{r.amount.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}</span>
                                            <span className={`font-bold ${r.status === 'confirmed' ? 'text-green-400' : r.status === 'rejected' ? 'text-red-400' : 'text-kce-amber'}`}>
                                                {t(`paymentRequest.${r.status}` as any)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
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
                        href="/docs/index.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kce-card p-3 flex items-center justify-between text-sm text-kce-cream no-underline active:opacity-70 transition-opacity"
                    >
                        <span>{t('profile.docs')}</span>
                        <span className="text-kce-muted text-xs">↗</span>
                    </a>
                    <a
                        href="/api/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kce-card p-3 flex items-center justify-between text-sm text-kce-cream no-underline active:opacity-70 transition-opacity"
                    >
                        <span>{t('profile.apiDocs')}</span>
                        <span className="text-kce-muted text-xs">↗</span>
                    </a>
                    <button
                        className="w-full py-2.5 text-sm font-bold text-kce-muted bg-kce-surface2 border border-kce-border rounded-lg transition-all active:scale-95"
                        onClick={() => {
                            authState.setToken(null)
                            setUser(null)
                        }}>
                        {t('auth.logout')}
                    </button>

                    {/* Account delete */}
                    {!confirmDelete ? (
                        <button className="text-[11px] text-kce-muted/50 text-center py-1 w-full"
                                onClick={() => setConfirmDelete(true)}>
                            {t('profile.deleteAccount')}
                        </button>
                    ) : (
                        <div className="kce-card p-3 flex flex-col gap-2">
                            <p className="text-xs text-center text-kce-muted">{t('profile.deleteConfirm')}</p>
                            <div className="flex gap-2">
                                <button className="btn-secondary flex-1 btn-sm"
                                        onClick={() => setConfirmDelete(false)}>{t('action.cancel')}
                                </button>
                                <button className="btn-secondary flex-1 btn-sm text-red-400/70" onClick={async () => {
                                    await api.deleteAccount()
                                    authState.setToken(null)
                                    setUser(null)
                                }}>{t('action.confirmDelete')}
                                </button>
                            </div>
                        </div>
                    )}

                    <p className="text-[10px] text-kce-muted/40 text-center py-2">© 2026 Marius Gassen</p>
                </div>
            </div>
        </div>
    )
}
