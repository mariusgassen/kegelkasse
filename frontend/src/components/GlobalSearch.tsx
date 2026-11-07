import {useSearchStore} from '@/store/search.ts'
import {useEffect, useMemo, useRef, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Sheet} from '@/components/ui/Sheet'
import {useT, useI18n} from '@/i18n'
import {useAppStore} from '@/store/app'
import {api} from '@/api/client'
import {router} from '@/router'
import {AiAskPanel} from '@/components/ai/AiAskPanel.tsx'
import {BookOpen} from 'lucide-react'
import {
    searchMembers,
    searchAccounts,
    searchEvenings,
    searchAnnouncements,
    searchTrips,
    searchStickers,
    searchBookings,
    type SearchResult,
} from '@/lib/globalSearch'

interface Props {
    open: boolean
    onClose: () => void
}

type GroupKey = 'member' | 'account' | 'evening' | 'booking' | 'announcement' | 'trip' | 'sticker'

const GROUP_ICON: Record<GroupKey, string> = {
    member: '🧑',
    account: '👤',
    evening: '📅',
    booking: '📒',
    announcement: '📣',
    trip: '🚌',
    sticker: '🏷️',
}

export function GlobalSearch({open, onClose}: Props) {
    const t = useT()
    const {locale} = useI18n()
    const regularMembers = useAppStore(s => s.regularMembers)
    const query = useSearchStore(s => s.query)
    const setQuery = useSearchStore(s => s.setQuery)
    const [askSignal, setAskSignal] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    const {data: evenings = []} = useQuery({queryKey: ['evenings'], queryFn: api.listEvenings, enabled: open, staleTime: 60000})
    const {data: announcements = []} = useQuery({queryKey: ['announcements'], queryFn: api.listAnnouncements, enabled: open, staleTime: 60000})
    const {data: trips = []} = useQuery({queryKey: ['trips'], queryFn: api.listTrips, enabled: open, staleTime: 60000})
    const {data: stickers = []} = useQuery({queryKey: ['stickers'], queryFn: api.listStickers, enabled: open, staleTime: 60000})
    const {data: payments = []} = useQuery({queryKey: ['member-payments'], queryFn: api.getAllPayments, enabled: open, staleTime: 60000})
    const {data: expenses = []} = useQuery({queryKey: ['club-expenses'], queryFn: api.getExpenses, enabled: open, staleTime: 60000})

    // Keep the previous query (and AI answer) across opens — following a result closes the sheet and
    // the member must be able to come back to it. Select the text so typing starts a new search.
    // Grab focus. No setTimeout here on purpose — mobile
    // browsers only auto-open the virtual keyboard for a focus() call still inside the same
    // task as the user's tap; a deferred focus (even a few ms later) often gets ignored. Sheet's
    // own open-focus effect (on the panel div) runs first because it's the child component —
    // effects flush child-before-parent within one commit — so this call reliably wins last.
    useEffect(() => {
        if (!open) return
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [open])

    const groups: { key: GroupKey; label: string; results: SearchResult[] }[] = useMemo(() => ([
        {key: 'member', label: t('search.members'), results: searchMembers(query, regularMembers)},
        {key: 'account', label: t('search.accounts'), results: searchAccounts(query, regularMembers)},
        {key: 'evening', label: t('search.evenings'), results: searchEvenings(query, evenings, locale)},
        {key: 'booking', label: t('search.bookings'), results: searchBookings(query, payments, expenses, locale)},
        {key: 'announcement', label: t('search.announcements'), results: searchAnnouncements(query, announcements)},
        {key: 'trip', label: t('search.trips'), results: searchTrips(query, trips, locale)},
        {key: 'sticker', label: t('search.stickers'), results: searchStickers(query, stickers)},
    ]), [query, regularMembers, evenings, announcements, trips, stickers, payments, expenses, locale, t])

    const hasQuery = query.trim().length > 0
    const totalResults = groups.reduce((sum, g) => sum + g.results.length, 0)

    function select(r: SearchResult) {
        // Typed router navigation — the destination page consumes the search params as its deep link.
        router.navigate({to: r.nav.to, search: r.nav.search} as never).catch(() => {})
        onClose()
    }

    return (
        <Sheet open={open} onClose={onClose} title={t('search.title')}>
            <input
                ref={inputRef}
                className="kce-input"
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setAskSignal(n => n + 1) }}
                placeholder={t('search.placeholder')}
            />
            <div className="flex flex-col gap-3 mt-3 max-h-[60vh] overflow-y-auto">
                <AiAskPanel question={query} askSignal={askSignal} onNavigate={onClose}/>
                {hasQuery && totalResults === 0 && (
                    <p className="text-xs text-muted text-center py-4">{t('search.noResults')}</p>
                )}
                {hasQuery && groups.filter(g => g.results.length > 0).map(g => (
                    <div key={g.key}>
                        <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                            {GROUP_ICON[g.key]} {g.label}
                        </div>
                        <div className="flex flex-col gap-1">
                            {g.results.map(r => (
                                <button
                                    key={`${r.kind}-${r.id}`}
                                    type="button"
                                    onClick={() => select(r)}
                                    className="kce-card p-2.5 text-left flex items-center justify-between active:opacity-70 w-full"
                                >
                                    <span className="text-sm text-ink truncate">{r.title}</span>
                                    {r.subtitle && (
                                        <span className="text-xs text-muted flex-shrink-0 ml-2">{r.subtitle}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <a href="/docs/" target="_blank" rel="noopener"
               className="mt-3 text-xs text-muted flex items-center justify-center gap-1" data-testid="search-docs-link">
                <BookOpen size={14} aria-hidden/> {t('search.docs')}
            </a>
        </Sheet>
    )
}
