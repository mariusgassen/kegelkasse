import {TagInput} from '@/components/ui/TagInput.tsx'
import {useState, useMemo} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {
    Sparkles,
    ThumbsUp,
    Plus,
    CheckCircle2,
    Clock,
    Lightbulb,
    Search,
    Shield,
    MessageSquare,
    Pin,
    Copy,
    Tag as TagIcon,
    XCircle,
} from 'lucide-react'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {canManageRoadmap, isSuperadmin, useAppStore} from '@/store/app'
import {Tabs} from '@/components/ui/Tabs'
import {Sheet} from '@/components/ui/Sheet'
import {Empty} from '@/components/ui/Empty'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {showToast} from '@/components/ui/Toast'
import {toastError} from '@/utils/error'
import {haptic} from '@/lib/haptics'
import {CardActionMenu, type SheetAction} from '@/components/ui/ActionSheet'
import {CommentThread} from '@/components/ui/CommentThread'
import {SuperadminRolesManager} from '@/components/superadmin/SuperadminRolesManager'
import type {RoadmapItem, RoadmapStatus} from '@/types'

type FilterTab = 'all' | 'planned' | 'in_progress' | 'idea' | 'completed' | 'duplicate'

const CATEGORY_PRESETS = [
    'feature',
    'improvement',
    'design',
    'evening',
    'kasse',
    'admin',
]

export function RoadmapPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const canManage = canManageRoadmap(user)
    const isSuper = isSuperadmin(user)

    const [activeTab, setActiveTab] = useState<FilterTab>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [selectedTag, setSelectedTag] = useState<string | null>(null)
    const [openCommentId, setOpenCommentId] = useState<number | null>(null)

    // Modals
    const [proposeOpen, setProposeOpen] = useState(false)
    const [rolesSheetOpen, setRolesSheetOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null)

    // Propose form state
    const [newTitle, setNewTitle] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newCategory, setNewCategory] = useState('feature')
    const [newTags, setNewTags] = useState<string[]>([])
    const [submitting, setSubmitting] = useState(false)

    // Edit form state
    const [editTitle, setEditTitle] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [editStatus, setEditStatus] = useState<RoadmapStatus>('idea')
    const [editCategory, setEditCategory] = useState('feature')
    const [editTags, setEditTags] = useState<string[]>([])
    const [editPinned, setEditPinned] = useState(false)
    const [editDuplicateId, setEditDuplicateId] = useState<number | null>(null)
    const [editAdminNotes, setEditAdminNotes] = useState('')
    const [editSaving, setEditSaving] = useState(false)

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
        {id: 'duplicate' as FilterTab, label: t('roadmap.status.duplicate')},
    ], [t])

    const availableTags = useMemo(() => {
        const set = new Set<string>()
        items.forEach(it => it.tags.forEach(tag => set.add(tag)))
        return Array.from(set).sort()
    }, [items])

    // Available categories from loaded items + defaults
    const availableCategories = useMemo(() => {
        const set = new Set<string>(CATEGORY_PRESETS)
        items.forEach(it => {
            if (it.category) set.add(it.category)
        })
        return Array.from(set)
    }, [items])

    const filteredItems = useMemo(() => {
        return items.filter(it => {
            if (activeTab !== 'all' && it.status !== activeTab) return false
            if (selectedCategory !== 'all' && it.category !== selectedCategory) return false
            if (selectedTag && !it.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase())) return false
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim()
                const matchTitle = it.title.toLowerCase().includes(q)
                const matchDesc = it.description ? it.description.toLowerCase().includes(q) : false
                const matchAuthor = it.author_name ? it.author_name.toLowerCase().includes(q) : false
                const matchTags = it.tags.some(t => t.toLowerCase().includes(q))
                const matchCategory = it.category ? it.category.toLowerCase().includes(q) : false
                if (!matchTitle && !matchDesc && !matchAuthor && !matchTags && !matchCategory) return false
            }
            return true
        })
    }, [items, activeTab, selectedCategory, selectedTag, searchQuery])

    const handleVote = async (itemId: number) => {
        haptic('selection')
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
                category: newCategory.trim() || 'feature',
                tags: newTags.join(',') || null,
            })
            haptic('success')
            showToast(t('roadmap.propose.success'))
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => old ? [created, ...old] : [created])
            setNewTitle('')
            setNewDesc('')
            setNewCategory('feature')
            setNewTags([])
            setProposeOpen(false)
        } catch (err) {
            toastError(err)
        } finally {
            setSubmitting(false)
        }
    }

    const openEditSheet = (item: RoadmapItem, defaultStatus?: RoadmapStatus) => {
        setEditingItem(item)
        setEditTitle(item.title)
        setEditDesc(item.description || '')
        setEditStatus(defaultStatus ?? item.status)
        setEditCategory(item.category || 'feature')
        setEditTags(item.tags)
        setEditPinned(item.is_pinned)
        setEditDuplicateId(item.duplicate_of_id)
        setEditAdminNotes(item.admin_notes || '')
    }

    const handleTogglePin = async (item: RoadmapItem) => {
        try {
            const updated = await api.updateRoadmapItem(item.id, {
                is_pinned: !item.is_pinned,
            })
            haptic('selection')
            showToast(updated.is_pinned ? t('roadmap.badge.pinned') : t('roadmap.action.unpin'))
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => {
                if (!old) return old
                return old.map(it => it.id === item.id ? updated : it)
            })
        } catch (err) {
            toastError(err)
        }
    }

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingItem || !editTitle.trim()) return

        setEditSaving(true)
        try {
            const payload = {
                title: editTitle.trim(),
                description: editDesc.trim() || null,
                status: editStatus,
                category: editCategory.trim() || 'feature',
                tags: editTags.join(',') || null,
                is_pinned: editPinned,
                duplicate_of_id: editStatus === 'duplicate' ? (editDuplicateId || null) : null,
                admin_notes: editAdminNotes.trim() || null,
            }

            const updated = await api.updateRoadmapItem(editingItem.id, payload)
            haptic('success')
            qc.setQueryData<RoadmapItem[]>(['roadmap'], old => {
                if (!old) return old
                return old.map(it => it.id === editingItem.id ? updated : it)
            })
            setEditingItem(null)
        } catch (err) {
            toastError(err)
        } finally {
            setEditSaving(false)
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
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-tint text-accent-tint-fg border border-accent/30">
                        <Clock className="w-3 h-3" />
                        {t('roadmap.status.planned')}
                    </span>
                )
            case 'in_progress':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-tint text-accent-tint-fg border border-accent/30">
                        <Sparkles className="w-3 h-3" />
                        {t('roadmap.status.in_progress')}
                    </span>
                )
            case 'completed':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-positive-tint text-positive-tint-fg border border-positive/30">
                        <CheckCircle2 className="w-3 h-3" />
                        {t('roadmap.status.completed')}
                    </span>
                )
            case 'duplicate':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
                        <Copy className="w-3 h-3" />
                        {t('roadmap.status.duplicate')}
                    </span>
                )
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
                        <XCircle className="w-3 h-3" />
                        {t('roadmap.status.rejected')}
                    </span>
                )
            case 'idea':
            default:
                return (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-2/15 text-accent-2-fg border border-accent-2/30">
                        <Lightbulb className="w-3 h-3" />
                        {t('roadmap.status.idea')}
                    </span>
                )
        }
    }

    const getCategoryLabel = (cat: string | null) => {
        if (!cat) return t('roadmap.category.feature')
        const key = `roadmap.category.${cat}` as const
        const translated = t(key as any)
        return translated !== key ? translated : cat
    }

    return (
        <div className="page-scroll pb-24 max-w-3xl mx-auto px-4 pt-3">
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
                <div className="flex items-center gap-2">
                    {isSuper && (
                        <button
                            type="button"
                            onClick={() => {
                                haptic('selection')
                                setRolesSheetOpen(true)
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-surface-2 text-ink border border-line hover:border-accent active:scale-95 transition-all shadow-sm"
                        >
                            <Shield className="w-3.5 h-3.5 text-accent" />
                            <span>{t('roadmap.manageRoles')}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            haptic('selection')
                            setProposeOpen(true)
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-accent text-on-accent active:scale-95 transition-all shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        <span>{t('roadmap.propose')}</span>
                    </button>
                </div>
            </div>

            {/* Search and Category Filters */}
            <div className="mb-3 space-y-2.5">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={t('roadmap.search.placeholder')}
                        className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-8 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label={t('action.cancel')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1"
                        >
                            ×
                        </button>
                    )}
                </div>

                {/* Category & Tag pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                    <button
                        type="button"
                        onClick={() => setSelectedCategory('all')}
                        className={`px-2.5 py-1 rounded-lg font-bold border transition-all flex-shrink-0 ${
                            selectedCategory === 'all'
                                ? 'bg-ink text-canvas border-ink'
                                : 'bg-surface-2 text-muted border-line hover:text-ink'
                        }`}
                    >
                        {t('roadmap.tab.all')}
                    </button>
                    {availableCategories.map(cat => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
                            className={`px-2.5 py-1 rounded-lg font-bold border transition-all flex-shrink-0 ${
                                selectedCategory === cat
                                    ? 'bg-accent text-on-accent border-accent'
                                    : 'bg-surface-2 text-muted border-line hover:text-ink'
                            }`}
                        >
                            {getCategoryLabel(cat)}
                        </button>
                    ))}
                    {selectedTag && (
                        <button
                            type="button"
                            onClick={() => setSelectedTag(null)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-accent-tint text-accent-tint-fg border border-accent/40 flex-shrink-0"
                        >
                            <span>#{selectedTag}</span>
                            <span>×</span>
                        </button>
                    )}
                </div>

                {/* Status Tabs */}
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
                        const isAuthor = item.created_by_user_id === user?.id
                        const canDelete = isSuper || (canManage && (item.club_id === null || item.club_id === user?.club_id)) || (isAuthor && item.status === 'idea')
                        const canEdit = canManage || isAuthor

                        const actions: SheetAction[] = []

                        if (canEdit) {
                            actions.push({
                                icon: '✏️',
                                label: t('roadmap.action.edit'),
                                onClick: () => openEditSheet(item),
                            })
                        }

                        if (canManage) {
                            actions.push({
                                icon: item.is_pinned ? '📍' : '📌',
                                label: item.is_pinned ? t('roadmap.action.unpin') : t('roadmap.action.pin'),
                                onClick: () => handleTogglePin(item),
                            })

                            actions.push({
                                icon: '🔗',
                                label: t('roadmap.action.markDuplicate'),
                                onClick: () => openEditSheet(item, 'duplicate'),
                            })
                        }

                        if (canDelete) {
                            actions.push({
                                icon: '🗑️',
                                label: t('roadmap.admin.delete'),
                                danger: true,
                                onClick: () => handleDelete(item.id),
                            })
                        }

                        return (
                            <div
                                key={item.id}
                                className={`kce-card p-4 border rounded-2xl transition-all ${
                                    item.is_pinned
                                        ? 'border-accent/40 bg-accent/5'
                                        : 'border-line hover:border-accent/40'
                                }`}
                            >
                                {/* Top Meta Row */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {renderStatusBadge(item.status)}

                                        {item.is_pinned && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-tint text-accent-tint-fg border border-accent/30">
                                                <Pin className="w-3 h-3" />
                                                {t('roadmap.badge.pinned')}
                                            </span>
                                        )}

                                        {item.is_official && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-ink border border-line">
                                                <Shield className="w-3 h-3 text-accent" />
                                                {t('roadmap.official')}
                                            </span>
                                        )}

                                        {item.category && (
                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
                                                {getCategoryLabel(item.category)}
                                            </span>
                                        )}

                                        {item.duplicate_of_id && (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-muted border border-line">
                                                <Copy className="w-3 h-3 text-muted" />
                                                <span>{t('roadmap.badge.duplicateOf')} {item.duplicate_of_title || `#${item.duplicate_of_id}`}</span>
                                            </span>
                                        )}

                                        {item.target_version && (
                                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                                                v{item.target_version}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Sheet Menu (kebab ⋮) */}
                                    {actions.length > 0 && (
                                        <CardActionMenu
                                            title={item.title}
                                            actions={actions}
                                        />
                                    )}
                                </div>

                                {/* Title & Description */}
                                <h2 className="text-base font-bold text-ink leading-snug">
                                    {item.title}
                                </h2>

                                {item.description && (
                                    <p className="text-xs text-muted mt-1.5 leading-relaxed whitespace-pre-line">
                                        {item.description}
                                    </p>
                                )}

                                {/* Tags */}
                                {item.tags && item.tags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                        <TagIcon className="w-3 h-3 text-muted" />
                                        {item.tags.map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all ${
                                                    selectedTag === tag
                                                        ? 'bg-accent text-on-accent border-accent'
                                                        : 'bg-surface-2 text-muted border-line hover:text-ink'
                                                }`}
                                            >
                                                #{tag}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Admin notes banner */}
                                {item.admin_notes && (
                                    <div className="mt-2.5 px-3 py-2 rounded-xl bg-surface-2 border border-line/60 text-xs text-muted flex items-start gap-2">
                                        <Sparkles className="w-3.5 h-3.5 text-accent flex-shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-bold text-ink">{t('roadmap.edit.adminNotes')}:</span> {item.admin_notes}
                                        </div>
                                    </div>
                                )}

                                {/* Bottom Row: Author + Voting + Comments next to each other */}
                                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-line/60 text-[11px] text-muted">
                                    <span className="truncate">
                                        {item.author_name ? `von ${item.author_name}` : ''}
                                    </span>

                                    <div className="flex items-center gap-2">
                                        {/* Upvote Button */}
                                        <button
                                            type="button"
                                            onClick={() => handleVote(item.id)}
                                            aria-label={`${t('roadmap.vote.upvote')}: ${item.title}`}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                                                item.has_voted
                                                    ? 'bg-accent text-on-accent border-accent shadow-sm'
                                                    : 'bg-surface-2 text-ink border-line hover:border-accent/40'
                                            }`}
                                        >
                                            <ThumbsUp className={`w-3.5 h-3.5 ${item.has_voted ? 'fill-current' : ''}`} />
                                            <span>{item.vote_count}</span>
                                        </button>

                                        {/* Comments Toggle Button directly next to upvote */}
                                        <button
                                            type="button"
                                            onClick={() => setOpenCommentId(openCommentId === item.id ? null : item.id)}
                                            aria-label={`${t('roadmap.comments')}: ${item.title}`}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 ${
                                                openCommentId === item.id
                                                    ? 'bg-accent-tint text-accent-tint-fg border-accent/40'
                                                    : 'bg-surface-2 text-muted hover:text-ink border-line hover:border-accent/40'
                                            }`}
                                        >
                                            <MessageSquare className="w-3.5 h-3.5" />
                                            <span>{item.comment_count ?? 0}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Comment Thread */}
                                {openCommentId === item.id && (
                                    <div className="mt-3 pt-3 border-t border-line/60">
                                        <CommentThread
                                            parentType="roadmap"
                                            parentId={item.id}
                                            open={true}
                                            onOpenChange={v => setOpenCommentId(v ? item.id : null)}
                                        />
                                    </div>
                                )}
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
                        <TagInput
                            id="roadmap-new-category"
                            max={1}
                            value={newCategory ? [newCategory] : []}
                            onChange={v => setNewCategory(v[0] ?? '')}
                            suggestions={availableCategories}
                            renderLabel={getCategoryLabel}
                        />
                    </div>

                    <div>
                        <label htmlFor="roadmap-new-tags" className="block text-xs font-bold text-ink mb-1">
                            {t('roadmap.propose.field.tags')}
                        </label>
                        <TagInput
                            id="roadmap-new-tags"
                            value={newTags}
                            onChange={setNewTags}
                            suggestions={availableTags}
                            placeholder={t('roadmap.propose.field.tags.placeholder')}
                        />
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

            {/* Edit / Move / Tag / Mark Idea Sheet */}
            <Sheet
                open={!!editingItem}
                onClose={() => setEditingItem(null)}
                title={t('roadmap.edit.title')}
            >
                {editingItem && (
                    <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
                        <div>
                            <label htmlFor="roadmap-edit-title" className="block text-xs font-bold text-ink mb-1">
                                {t('roadmap.propose.field.title')} *
                            </label>
                            <input
                                id="roadmap-edit-title"
                                type="text"
                                required
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                            />
                        </div>

                        {canManage && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="roadmap-edit-status" className="block text-xs font-bold text-ink mb-1">
                                        {t('roadmap.edit.status')}
                                    </label>
                                    <select
                                        id="roadmap-edit-status"
                                        value={editStatus}
                                        onChange={e => setEditStatus(e.target.value as RoadmapStatus)}
                                        className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                                    >
                                        <option value="idea">{t('roadmap.status.idea')}</option>
                                        <option value="planned">{t('roadmap.status.planned')}</option>
                                        <option value="in_progress">{t('roadmap.status.in_progress')}</option>
                                        <option value="completed">{t('roadmap.status.completed')}</option>
                                        <option value="duplicate">{t('roadmap.status.duplicate')}</option>
                                        <option value="rejected">{t('roadmap.status.rejected')}</option>
                                    </select>
                                </div>

                                <div className="flex items-center pt-5">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink">
                                        <input
                                            type="checkbox"
                                            checked={editPinned}
                                            onChange={e => setEditPinned(e.target.checked)}
                                            className="rounded border-line text-accent focus:ring-accent"
                                        />
                                        <span>{t('roadmap.edit.pinned')}</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {canManage && editStatus === 'duplicate' && (
                            <div>
                                <label htmlFor="roadmap-edit-dup" className="block text-xs font-bold text-ink mb-1">
                                    {t('roadmap.edit.duplicateOf')}
                                </label>
                                <select
                                    id="roadmap-edit-dup"
                                    value={editDuplicateId || ''}
                                    onChange={e => setEditDuplicateId(e.target.value ? Number(e.target.value) : null)}
                                    className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
                                >
                                    <option value="">{t('roadmap.edit.duplicateNone')}</option>
                                    {items
                                        .filter(it => it.id !== editingItem.id)
                                        .map(it => (
                                            <option key={it.id} value={it.id}>
                                                #{it.id}: {it.title}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="roadmap-edit-cat" className="block text-xs font-bold text-ink mb-1">
                                    {t('roadmap.edit.category')}
                                </label>
                                <TagInput
                                    id="roadmap-edit-cat"
                                    max={1}
                                    value={editCategory ? [editCategory] : []}
                                    onChange={v => setEditCategory(v[0] ?? '')}
                                    suggestions={availableCategories}
                                    renderLabel={getCategoryLabel}
                                />
                            </div>

                            <div>
                                <label htmlFor="roadmap-edit-tags" className="block text-xs font-bold text-ink mb-1">
                                    {t('roadmap.edit.tags')}
                                </label>
                                <TagInput
                                    id="roadmap-edit-tags"
                                    value={editTags}
                                    onChange={setEditTags}
                                    suggestions={availableTags}
                                    placeholder={t('roadmap.edit.tags.placeholder')}
                                />
                            </div>
                        </div>

                        {canManage && (
                            <div>
                                <label htmlFor="roadmap-edit-admin-notes" className="block text-xs font-bold text-ink mb-1">
                                    {t('roadmap.edit.adminNotes')}
                                </label>
                                <textarea
                                    id="roadmap-edit-admin-notes"
                                    rows={2}
                                    value={editAdminNotes}
                                    onChange={e => setEditAdminNotes(e.target.value)}
                                    placeholder={t('roadmap.edit.adminNotes.placeholder')}
                                    className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                                />
                            </div>
                        )}

                        <div>
                            <label htmlFor="roadmap-edit-desc" className="block text-xs font-bold text-ink mb-1">
                                {t('roadmap.propose.field.description')}
                            </label>
                            <textarea
                                id="roadmap-edit-desc"
                                rows={3}
                                value={editDesc}
                                onChange={e => setEditDesc(e.target.value)}
                                className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditingItem(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-surface-2 text-muted active:scale-95 transition-all"
                            >
                                {t('action.cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={editSaving || !editTitle.trim()}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-accent text-on-accent disabled:opacity-50 active:scale-95 transition-all shadow-sm"
                            >
                                {editSaving ? t('action.loading') : t('action.save')}
                            </button>
                        </div>
                    </form>
                )}
            </Sheet>

            {/* Superadmin Roles Sheet */}
            <Sheet
                open={rolesSheetOpen}
                onClose={() => setRolesSheetOpen(false)}
                title={t('superadmin.roles.title')}
            >
                <div className="pt-2">
                    <SuperadminRolesManager />
                </div>
            </Sheet>
        </div>
    )
}
