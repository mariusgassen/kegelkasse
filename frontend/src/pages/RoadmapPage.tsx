import {useState, useMemo} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {
    Sparkles,
    ThumbsUp,
    Plus,
    Info,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Clock,
    Lightbulb,
    Trash2,
    Search,
    Shield,
} from 'lucide-react'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {isAdmin, useAppStore} from '@/store/app'
import {Tabs} from '@/components/ui/Tabs'
import {Sheet} from '@/components/ui/Sheet'
import {Empty} from '@/components/ui/Empty'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {showToast} from '@/components/ui/Toast'
import {toastError} from '@/utils/error'
import {haptic} from '@/lib/haptics'
import type {RoadmapCategory, RoadmapItem, RoadmapStatus} from '@/types'

type FilterTab = 'all' | 'planned' | 'in_progress' | 'idea' | 'completed'

export function RoadmapPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const admin = isAdmin(user)
    const isSuper = user?.role === 'superadmin'

    const [activeTab, setActiveTab] = useState<FilterTab>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [principlesOpen, setPrinciplesOpen] = useState(false)
    const [proposeOpen, setProposeOpen] = useState(false)

    // Form state
    const [newTitle, setNewTitle] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newCategory, setNewCategory] = useState<RoadmapCategory>('feature')
    const [submitting, setSubmitting] = useState(false)

    const {data: items = [], isLoading} = useQuery({
        queryKey: ['roadmap'],
        queryFn: () => api.listRoadmap(),
    })

    const tabs = useMemo(() => [
        {id: 'all' as FilterTab, label: t('roadmap.tab.all')},
        {id: 'planned' as FilterTab, label: t('roadmap.tab.planned')},
        {id: 'in_progress' as FilterTab, label: t('roadmap.tab.in_progress')},
        {id: 'idea' as FilterTab, label: t('roadmap.tab.idea')},
        {id: 'completed' as FilterTab, label: t('roadmap.tab.completed')},
    ], [t])

    const filteredItems = useMemo(() => {
        return items.filter(it => {
            if (activeTab !== 'all' && it.status !== activeTab) return false
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim()
                const matchTitle = it.title.toLowerCase().includes(q)
                const matchDesc = it.description ? it.description.toLowerCase().includes(q) : false
                const matchAuthor = it.author_name ? it.author_name.toLowerCase().includes(q) : false
                if (!matchTitle && !matchDesc && !matchAuthor) return false
            }
            return true
        })
    }, [items, activeTab, searchQuery])

    const handleVote = async (itemId: number) => {
        haptic('selection')
        // Optimistic update
        qc.setQueryData<RoadmapItem[]>(['roadmap'], old => {
            if (!old) return old
            return old.map(it => {
                if (it.id !== itemId) return it
                const newVoted = !it.has_voted
                return {
                    ...it,
                    has_voted: newVoted,
                    vote_count: newVoted ? it.vote_count + 1 : Math.max(0, it.vote_count - 1),
                }
            })
        })

        try {
            const res = await api.toggleRoadmapVote(itemId)
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => {
                if (!old) return old
                return old.map(it => it.id === itemId ? {...it, has_voted: res.has_voted, vote_count: res.vote_count} : it)
            })
        } catch (err) {
            toastError(err)
            void qc.invalidateQueries({queryKey: ['roadmap']})
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim()) return

        setSubmitting(true)
        try {
            const created = await api.createRoadmapItem({
                title: newTitle.trim(),
                description: newDesc.trim() || null,
                category: newCategory,
            })
            haptic('success')
            showToast(t('roadmap.propose.success'))
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => old ? [created, ...old] : [created])
            setNewTitle('')
            setNewDesc('')
            setNewCategory('feature')
            setProposeOpen(false)
        } catch (err) {
            toastError(err)
        } finally {
            setSubmitting(false)
        }
    }

    const handleStatusChange = async (itemId: number, newStatus: RoadmapStatus) => {
        try {
            const updated = await api.updateRoadmapItem(itemId, {status: newStatus})
            haptic('selection')
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => {
                if (!old) return old
                return old.map(it => it.id === itemId ? updated : it)
            })
        } catch (err) {
            toastError(err)
        }
    }

    const handleDelete = async (itemId: number) => {
        if (!window.confirm(t('roadmap.admin.deleteConfirm'))) return
        try {
            await api.deleteRoadmapItem(itemId)
            haptic('selection')
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => {
                if (!old) return old
                return old.filter(it => it.id !== itemId)
            })
        } catch (err) {
            toastError(err)
        }
    }

    const renderStatusBadge = (status: RoadmapStatus) => {
        switch (status) {
            case 'planned':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-tint text-accent-tint-fg">
                        <Clock className="w-3 h-3" />
                        {t('roadmap.status.planned')}
                    </span>
                )
            case 'in_progress':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                        <Sparkles className="w-3 h-3" />
                        {t('roadmap.status.in_progress')}
                    </span>
                )
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-positive-tint text-positive-tint-fg">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('roadmap.status.completed')}
                    </span>
                )
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-muted">
                        {t('roadmap.status.rejected')}
                    </span>
                )
            case 'idea':
            default:
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        <Lightbulb className="w-3 h-3" />
                        {t('roadmap.status.idea')}
                    </span>
                )
        }
    }

    return (
        <div className="pb-24 max-w-3xl mx-auto px-4 pt-3">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
                        <span>🗺️</span>
                        <span>{t('roadmap.title')}</span>
                    </h1>
                    <p className="text-xs text-muted mt-0.5">
                        {t('roadmap.subtitle')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        haptic('selection')
                        setProposeOpen(true)
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-accent text-on-accent active:scale-95 transition-all shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span>{t('roadmap.propose')}</span>
                </button>
            </div>

            {/* Redesign Principles Accordion */}
            <div className="kce-card p-3 mb-4 overflow-hidden border border-line">
                <button
                    type="button"
                    onClick={() => setPrinciplesOpen(v => !v)}
                    className="w-full flex items-center justify-between text-left text-xs font-bold text-ink"
                    aria-expanded={principlesOpen}
                >
                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-accent" />
                        <span>{t('roadmap.principles.title')}</span>
                    </div>
                    {principlesOpen ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>

                {principlesOpen && (
                    <div className="mt-3 pt-3 border-t border-line text-xs text-muted space-y-2">
                        <div className="flex items-start gap-2">
                            <span className="font-bold text-ink">1.</span>
                            <span>{t('roadmap.principles.p1')}</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="font-bold text-ink">2.</span>
                            <span>{t('roadmap.principles.p2')}</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="font-bold text-ink">3.</span>
                            <span>{t('roadmap.principles.p3')}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Search and Tabs */}
            <div className="mb-3 space-y-2">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('roadmap.search.placeholder')}
                        className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                    />
                </div>
                <Tabs items={tabs} value={activeTab} onChange={setActiveTab} />
            </div>

            {/* List */}
            {isLoading ? (
                <div className="space-y-3">
                    <SkeletonRows rows={4} />
                </div>
            ) : filteredItems.length === 0 ? (
                <Empty icon="💡" text={t('roadmap.empty')} />
            ) : (
                <div className="space-y-3">
                    {filteredItems.map(item => {
                        const canDelete = isSuper || (admin && item.club_id === user?.club_id) || (item.created_by_user_id === user?.id && item.status === 'idea')
                        const canChangeStatus = isSuper || (admin && (item.club_id === user?.club_id || isSuper))

                        return (
                            <div
                                key={item.id}
                                className="kce-card p-4 border border-line rounded-2xl flex items-start gap-3.5 transition-all hover:border-accent/40"
                            >
                                {/* Upvote Column */}
                                <button
                                    type="button"
                                    onClick={() => handleVote(item.id)}
                                    aria-label={`${t('roadmap.vote.upvote')}: ${item.title}`}
                                    className={`flex flex-col items-center justify-center min-w-[50px] px-2 py-2 rounded-xl border transition-all active:scale-95 ${
                                        item.has_voted
                                            ? 'bg-accent text-on-accent border-accent shadow-sm'
                                            : 'bg-surface-2 text-ink border-line hover:border-accent/40'
                                    }`}
                                >
                                    <ThumbsUp className={`w-4 h-4 mb-0.5 ${item.has_voted ? 'fill-current' : ''}`} />
                                    <span className="text-xs font-extrabold">{item.vote_count}</span>
                                </button>

                                {/* Item Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                        {renderStatusBadge(item.status)}
                                        {item.is_official && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-ink border border-line">
                                                <Shield className="w-3 h-3 text-accent" />
                                                {t('roadmap.official')}
                                            </span>
                                        )}
                                        {item.target_version && (
                                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                                                v{item.target_version}
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="text-sm font-bold text-ink leading-snug">
                                        {item.title}
                                    </h3>

                                    {item.description && (
                                        <p className="text-xs text-muted mt-1 leading-relaxed whitespace-pre-line">
                                            {item.description}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-line/60 text-[11px] text-muted">
                                        <span>
                                            {item.author_name ? `von ${item.author_name}` : ''}
                                        </span>

                                        {/* Actions for Admin / Author */}
                                        <div className="flex items-center gap-2">
                                            {canChangeStatus && !item.is_official && (
                                                <select
                                                    value={item.status}
                                                    onChange={e => handleStatusChange(item.id, e.target.value as RoadmapStatus)}
                                                    className="bg-surface-2 border border-line text-ink text-[11px] font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-accent"
                                                >
                                                    <option value="idea">{t('roadmap.status.idea')}</option>
                                                    <option value="planned">{t('roadmap.status.planned')}</option>
                                                    <option value="in_progress">{t('roadmap.status.in_progress')}</option>
                                                    <option value="completed">{t('roadmap.status.completed')}</option>
                                                    <option value="rejected">{t('roadmap.status.rejected')}</option>
                                                </select>
                                            )}

                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(item.id)}
                                                    aria-label={`${t('roadmap.admin.delete')}: ${item.title}`}
                                                    className="p-1 rounded text-muted hover:text-danger-fg active:scale-95 transition-all"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Propose Idea Sheet */}
            <Sheet
                open={proposeOpen}
                onClose={() => setProposeOpen(false)}
                title={t('roadmap.propose.title')}
            >
                <form onSubmit={handleCreate} className="space-y-4 pt-2">
                    <p className="text-xs text-muted">
                        {t('roadmap.propose.subtitle')}
                    </p>

                    <div>
                        <label htmlFor="roadmap-new-title" className="block text-xs font-bold text-ink mb-1">
                            {t('roadmap.propose.field.title')} *
                        </label>
                        <input
                            id="roadmap-new-title"
                            type="text"
                            required
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder={t('roadmap.propose.field.title.placeholder')}
                            className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div>
                        <label htmlFor="roadmap-new-category" className="block text-xs font-bold text-ink mb-1">
                            {t('roadmap.propose.field.category')}
                        </label>
                        <select
                            id="roadmap-new-category"
                            value={newCategory}
                            onChange={e => setNewCategory(e.target.value as RoadmapCategory)}
                            className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                        >
                            <option value="feature">{t('roadmap.propose.category.feature')}</option>
                            <option value="improvement">{t('roadmap.propose.category.improvement')}</option>
                            <option value="design">{t('roadmap.propose.category.design')}</option>
                            <option value="bug">{t('roadmap.propose.category.bug')}</option>
                            <option value="general">{t('roadmap.propose.category.general')}</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="roadmap-new-desc" className="block text-xs font-bold text-ink mb-1">
                            {t('roadmap.propose.field.description')}
                        </label>
                        <textarea
                            id="roadmap-new-desc"
                            rows={3}
                            value={newDesc}
                            onChange={e => setNewDesc(e.target.value)}
                            placeholder={t('roadmap.propose.field.description.placeholder')}
                            className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                        />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setProposeOpen(false)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted active:scale-95 transition-all"
                        >
                            {t('action.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !newTitle.trim()}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-on-accent disabled:opacity-50 active:scale-95 transition-all shadow-sm"
                        >
                            {submitting ? t('action.loading') : t('roadmap.propose.submit')}
                        </button>
                    </div>
                </form>
            </Sheet>
        </div>
    )
}
