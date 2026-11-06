import {useEffect, useState} from 'react'
import {ArrowRight, BookOpen, Sparkles, UserRound} from 'lucide-react'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {useAiEnabled} from '@/hooks/useAiEnabled.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Markdown} from '@/components/ui/Markdown.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {aiErrorKey} from '@/lib/aiErrors.ts'
import {followAiLink} from '@/lib/aiLinks.ts'
import {useSearchStore} from '@/store/search.ts'
import type {AiLink} from '@/types.ts'

interface Props {
    question: string
    /** Bumped by the parent (Enter in the search field) to ask without tapping the button. */
    askSignal?: number
    /** Called after an answer link navigated inside the app, so the search sheet can close. */
    onNavigate: () => void
}

const LINK_ICON = {app: ArrowRight, profile: UserRound, docs: BookOpen} as const

/**
 * "✨ KI fragen" inside the global search: sends the typed question to /ai/ask and renders the
 * Markdown answer. Links in the answer are server-validated app:/docs: targets and become
 * buttons that navigate within the app (or open the docs). Hidden without an API key or when
 * the club switched the feature off.
 */
export function AiAskPanel({question, askSignal = 0, onNavigate}: Props) {
    const t = useT()
    const enabled = useAiEnabled('search')
    const online = useOnline()
    const answer = useSearchStore(s => s.answer)
    const asked = useSearchStore(s => s.asked)
    const setAnswer = useSearchStore(s => s.setAnswer)
    const [loading, setLoading] = useState(false)
    const q = question.trim()

    async function ask() {
        if (q.length < 3 || loading) return
        setLoading(true)
        try {
            const r = await api.aiAsk(q)
            setAnswer(r, q)
        } catch (e) {
            const key = aiErrorKey(e)
            if (key) showToast(t(key), 'error')
            else toastError(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (askSignal > 0 && enabled && online) void ask()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [askSignal])

    if (!enabled) return null

    const links = new Map((answer?.links ?? []).map(l => [l.href, l]))

    function follow(link: AiLink) {
        if (followAiLink(link)) onNavigate()
    }

    return (
        <div className="flex flex-col gap-2" data-testid="ai-ask">
            {q.length >= 3 && q !== asked && (
                <button type="button" className="btn-secondary w-full flex items-center justify-center gap-2"
                        onClick={ask} disabled={loading || !online} data-testid="ai-ask-button">
                    <Sparkles size={16} aria-hidden/>
                    <span className="truncate">{loading ? t('ai.search.thinking') : t('ai.search.ask').replace('{q}', q)}</span>
                </button>
            )}
            {answer && (
                <div className="kce-card p-3 text-sm text-ink" data-testid="ai-answer">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Sparkles size={14} aria-hidden/> {t('ai.search.answerTitle')}
                    </div>
                    <Markdown text={answer.answer} renderLink={(label, href, key) => {
                        const link = links.get(href)
                        if (!link) return null
                        const Icon = LINK_ICON[link.kind]
                        return (
                            <button key={key} type="button" onClick={() => follow(link)}
                                    className="inline-flex items-center gap-1 align-baseline px-2 py-0.5 mx-0.5 rounded-full bg-accent-tint text-accent-tint-fg font-bold">
                                {label}<Icon size={13} aria-hidden/>
                            </button>
                        )
                    }}/>
                    {answer.sources.length > 0 && (
                        <div className="mt-3 pt-2 border-t border-line flex flex-col gap-1">
                            <span className="text-xs text-muted">{t('ai.search.sources')}</span>
                            {answer.sources.map(s => (
                                <a key={s.url} href={s.url} target="_blank" rel="noopener"
                                   className="text-xs text-accent-fg flex items-center gap-1">
                                    <BookOpen size={12} aria-hidden/> {s.title}
                                </a>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-muted mt-2">{t('ai.search.disclaimer')}</p>
                </div>
            )}
        </div>
    )
}
