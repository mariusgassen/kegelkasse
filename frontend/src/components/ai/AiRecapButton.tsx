import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {Sparkles} from 'lucide-react'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useAiEnabled} from '@/hooks/useAiEnabled.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Markdown} from '@/components/ui/Markdown.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {aiErrorKey} from '@/lib/aiErrors.ts'
import {Button} from '@/components/ui/Button.tsx'

type Target = { kind: 'evening'; eveningId: number } | { kind: 'season'; year: number }

/**
 * "✨ KI-Rückblick": asks Claude for a funny Stammtisch-style recap, shows it in an editable sheet,
 * and lets committee members and admins post it to the news feed (a normal announcement).
 * Renders nothing when the server has no Claude API key.
 */
export function AiRecapButton({target, className = 'btn-secondary btn-sm'}: { target: Target; className?: string }) {
    const t = useT()
    const enabled = useAiEnabled('recaps')
    const online = useOnline()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const regularMembers = useAppStore(s => s.regularMembers)
    const me = regularMembers.find(m => m.id === user?.regular_member_id)
    const canPost = isAdmin(user) || !!me?.is_committee

    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [posting, setPosting] = useState(false)
    const [title, setTitle] = useState('')
    const [text, setText] = useState('')
    const [editing, setEditing] = useState(false)

    if (!enabled) return null

    async function generate() {
        setLoading(true)
        try {
            const r = target.kind === 'evening'
                ? await api.aiRecapEvening(target.eveningId)
                : await api.aiRecapSeason(target.year)
            setTitle(r.title)
            setText(r.text)
            setEditing(false)
            setOpen(true)
        } catch (e) {
            const key = aiErrorKey(e)
            if (key) showToast(t(key), 'error')
            else toastError(e)
        } finally {
            setLoading(false)
        }
    }

    async function post() {
        if (!title.trim()) return
        setPosting(true)
        try {
            await api.createAnnouncement({title: title.trim(), text: text.trim() || undefined})
            await qc.invalidateQueries({queryKey: ['committee-announcements']})
            showToast(t('ai.posted'))
            setOpen(false)
        } catch (e) {
            toastError(e)
        } finally {
            setPosting(false)
        }
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(`${title}\n\n${text}`)
            showToast(t('ai.copied'))
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <>
            <button type="button" className={`${className} inline-flex items-center justify-center gap-1.5`}
                    onClick={generate} disabled={loading || !online} data-testid="ai-recap-button">
                <Sparkles size={14} aria-hidden="true"/>
                {loading ? t('ai.generating') : t(target.kind === 'season' ? 'ai.button.seasonRecap' : 'ai.button.recap')}
            </button>
            <Sheet open={open} onClose={() => setOpen(false)} title={t('ai.recap.title')}>
                <div className="flex flex-col gap-3" data-testid="ai-recap-sheet">
                    <p className="text-xs text-muted">{t('ai.recap.hint')}</p>
                    <div>
                        <label className="field-label" htmlFor="ai-recap-title">{t('ai.recap.headline')}</label>
                        <input id="ai-recap-title" className="kce-input" value={title}
                               onChange={e => setTitle(e.target.value)}/>
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                            <label className="field-label" htmlFor="ai-recap-text">{t('ai.recap.text')}</label>
                            <button type="button" className="text-xs text-accent-fg font-semibold"
                                    onClick={() => setEditing(e => !e)} data-testid="ai-recap-edit-toggle">
                                {editing ? t('ai.recap.preview') : t('ai.recap.edit')}
                            </button>
                        </div>
                        {editing ? (
                            <textarea id="ai-recap-text" className="kce-input" rows={10} value={text}
                                      onChange={e => setText(e.target.value)}/>
                        ) : (
                            <div id="ai-recap-text" className="kce-card text-sm p-4 leading-relaxed" data-testid="ai-recap-preview">
                                <Markdown text={text}/>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={copy}>
                            {t('ai.copy')}
                        </Button>
                        <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={generate}
                                disabled={loading || !online}>
                            {loading ? t('ai.generating') : t('ai.regenerate')}
                        </Button>
                    </div>
                    {canPost && (
                        <Button type="button" variant="primary" block onClick={post}
                                disabled={posting || !online || !title.trim()} data-testid="ai-recap-post">
                            {posting ? t('action.loading') : `📣 ${t('ai.post')}`}
                        </Button>
                    )}
                </div>
            </Sheet>
        </>
    )
}
