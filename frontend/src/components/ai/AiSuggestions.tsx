import {useState} from 'react'
import {Sparkles} from 'lucide-react'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {useAiEnabled} from '@/hooks/useAiEnabled.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {aiErrorKey} from '@/lib/aiErrors.ts'
import type {AiNicknameSuggestion, AiPenaltySuggestion} from '@/types.ts'
import {Button} from '@/components/ui/Button.tsx'

function reportAiError(e: unknown, t: ReturnType<typeof useT>) {
    const key = aiErrorKey(e)
    if (key) showToast(t(key), 'error')
    else toastError(e)
}

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

/**
 * "✨ KI-Vorschläge" for the penalty catalog. Claude proposes new penalty types from the club's
 * own history; tapping one hands it to `onPick`, which prefills the add form so the admin still
 * reviews and saves it. Renders nothing when AI is not configured.
 */
export function PenaltySuggestions({onPick}: { onPick: (s: AiPenaltySuggestion) => void }) {
    const t = useT()
    const enabled = useAiEnabled('suggestions')
    const online = useOnline()
    const [loading, setLoading] = useState(false)
    const [list, setList] = useState<AiPenaltySuggestion[] | null>(null)

    if (!enabled) return null

    async function load() {
        setLoading(true)
        try {
            setList((await api.aiSuggestPenaltyTypes()).suggestions)
        } catch (e) {
            reportAiError(e, t)
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button type="button" onClick={load} disabled={loading || !online}
                    variant="secondary" size="sm" block className="mt-2 inline-flex items-center justify-center gap-1.5"
                    data-testid="ai-penalty-suggest">
                <Sparkles size={14} aria-hidden="true"/>
                {loading ? t('ai.generating') : t('ai.button.suggest')}
            </Button>
            <Sheet open={list !== null} onClose={() => setList(null)} title={t('ai.suggest.title')}>
                <p className="text-xs text-muted mb-3">{t('ai.suggest.hint')}</p>
                {list && list.length === 0 && <p className="text-sm text-muted">{t('ai.suggest.none')}</p>}
                <div className="flex flex-col gap-2">
                    {list?.map(s => (
                        <button key={s.name} type="button" className="kce-card p-3 text-left flex items-start gap-3"
                                onClick={() => { onPick(s); setList(null) }}>
                            <span className="text-xl" aria-hidden="true">{s.icon}</span>
                            <span className="flex-1 min-w-0">
                                <span className="flex justify-between gap-2">
                                    <span className="text-sm font-bold text-ink">{s.name}</span>
                                    <span className="text-sm font-bold text-accent-fg">{fe(s.amount)}</span>
                                </span>
                                <span className="block text-xs text-muted">{s.reason}</span>
                            </span>
                            <span className="text-muted" aria-hidden="true">›</span>
                        </button>
                    ))}
                </div>
            </Sheet>
        </>
    )
}

/**
 * "✨ Kegelname vorschlagen" in the member edit sheet: three ideas from the member's stats and
 * first name; tapping one fills the nickname field. Only for existing members (needs history).
 */
export function NicknameSuggestions({memberId, onPick}: { memberId: number; onPick: (nickname: string) => void }) {
    const t = useT()
    const enabled = useAiEnabled('suggestions')
    const online = useOnline()
    const [loading, setLoading] = useState(false)
    const [list, setList] = useState<AiNicknameSuggestion[]>([])
    const [hint, setHint] = useState('')

    if (!enabled) return null

    async function load() {
        setLoading(true)
        try {
            setList((await api.aiSuggestNickname(memberId, hint.trim() || undefined)).suggestions)
        } catch (e) {
            reportAiError(e, t)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="mt-2" data-testid="ai-nickname">
            <input className="kce-input mb-2" value={hint} maxLength={200}
                   onChange={e => setHint(e.target.value)}
                   placeholder={t('ai.nickname.hintPlaceholder')} aria-label={t('ai.nickname.hintPlaceholder')}/>
            <Button type="button" onClick={load} disabled={loading || !online}
                    variant="secondary" size="sm" className="inline-flex items-center gap-1.5">
                <Sparkles size={14} aria-hidden="true"/>
                {loading ? t('ai.generating') : t('ai.button.suggestNickname')}
            </Button>
            {list.length > 0 && (
                <div className="mt-2">
                    <p className="text-xs text-muted mb-1">{t('ai.nickname.hint')}</p>
                    <div className="flex flex-col gap-1.5">
                        {list.map(s => (
                            <button key={s.nickname} type="button"
                                    className="kce-card p-2 text-left"
                                    onClick={() => { onPick(s.nickname); setList([]) }}>
                                <span className="block text-sm font-bold text-ink">{s.nickname}</span>
                                <span className="block text-xs text-muted">{s.reason}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
