import {useRef, useState} from 'react'
import {api, authState} from '@/api/client'
import {useAppStore} from '@/store/app'
import {Locale, useI18n, useT} from '@/i18n'
import {showToast} from '@/components/ui/Toast'

function resizeToBase64(file: File, size = 256): Promise<string> {
    return new Promise(resolve => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = size; canvas.height = size
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
            showToast('Fehler beim Hochladen')
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
            setCurrentPw(''); setNewPw('')
            showToast(t('club.savedOk'))
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    const initials = (user?.name || '?')[0].toUpperCase()

    return (
        <div className="bottom-sheet" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="sheet-panel safe-bottom" style={{maxHeight: '92vh'}}>
                <div className="sheet-handle"/>

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
                            Bild entfernen
                        </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange}/>
                </div>

                {/* Profile form */}
                <div className="flex flex-col gap-3">
                    <div className="kce-card p-4 flex flex-col gap-3">
                        <div>
                            <label className="field-label">Anzeigename</label>
                            <input className="kce-input" value={name} onChange={e => setName(e.target.value)}
                                   placeholder="Vorname Nachname"/>
                        </div>
                        <div>
                            <label className="field-label">Username</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kce-muted text-sm">@</span>
                                <input className="kce-input pl-6" value={username}
                                       onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                                       placeholder="username"/>
                            </div>
                        </div>
                        <div>
                            <label className="field-label">Login-E-Mail</label>
                            {isFakeEmail && !email && (
                                <p className="text-[10px] text-kce-muted mb-1">Noch keine E-Mail — Login per Username.</p>
                            )}
                            <input className="kce-input" type="email" value={email}
                                   onChange={e => setEmail(e.target.value)} placeholder="deine@email.de"/>
                        </div>
                    </div>

                    <div className="kce-card p-4 flex flex-col gap-3">
                        <div className="text-xs font-bold text-kce-muted uppercase tracking-wider">Passwort ändern</div>
                        <div>
                            <label className="field-label">Aktuelles Passwort</label>
                            <input className="kce-input" type="password" value={currentPw}
                                   onChange={e => setCurrentPw(e.target.value)} placeholder="••••••••"/>
                        </div>
                        <div>
                            <label className="field-label">Neues Passwort</label>
                            <input className="kce-input" type="password" value={newPw}
                                   onChange={e => setNewPw(e.target.value)} placeholder="••••••••"/>
                        </div>
                    </div>

                    {/* Language */}
                    <div className="kce-card p-4 flex items-center justify-between">
                        <span className="text-xs font-bold text-kce-muted uppercase tracking-wider">Sprache</span>
                        <div className="flex gap-1">
                            {(['de', 'en'] as const).map(l => (
                                <button key={l} onClick={() => { setLocale(l); api.updateLocale(l).catch(() => {}) }}
                                        className={`text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all ${locale === l ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}>
                                    {l.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button className="btn-primary w-full" disabled={saving} onClick={save}>
                        {saving ? 'Speichern…' : t('action.save')}
                    </button>
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
                            Konto löschen
                        </button>
                    ) : (
                        <div className="kce-card p-3 flex flex-col gap-2 border border-red-900/40">
                            <p className="text-xs text-center text-kce-cream">Konto wirklich löschen? Statistiken bleiben erhalten.</p>
                            <div className="flex gap-2">
                                <button className="btn-secondary flex-1 btn-sm" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
                                <button className="btn-danger flex-1 btn-sm" onClick={async () => {
                                    await api.deleteAccount()
                                    authState.setToken(null)
                                    setUser(null)
                                }}>Ja, löschen</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
