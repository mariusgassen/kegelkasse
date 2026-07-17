import {useEffect, useMemo, useRef, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Sheet} from '@/components/ui/Sheet'
import {useT, useI18n} from '@/i18n'
import {useAppStore} from '@/store/app'
import {api} from '@/api/client'
import {
    searchMembers,
    searchAccounts,
    searchEvenings,
    searchAnnouncements,
    searchTrips,
    searchBookings,
    type SearchResult,
} from '@/lib/globalSearch'

interface Props {
    open: boolean
    onClose: () => void
}

type GroupKey = 'member' | 'account' | 'evening' | 'booking' | 'announcement' | 'trip'

const GROUP_ICON: Record<GroupKey, string> = {
    member: '🧑',
    account: '👤',
    evening: '📅',
    booking: '📒',
    announcement: '📣',
    trip: '🚌',
}

export function GlobalSearch({open, onClose}: Props) {
    const t = useT()
    const {locale} = useI18n()
    const regularMembers = useAppStore(s => s.regularMembers)
    const [query, setQuery] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const {data: evenings = []} = useQuery({queryKey: ['evenings'], queryFn: api.listEvenings, enabled: open, staleTime: 60000})
    const {data: announcements = []} = useQuery({queryKey: ['announcements'], queryFn: api.listAnnouncements, enabled: open, staleTime: 60000})
    const {data: trips = []} = useQuery({queryKey: ['trips'], queryFn: api.listTrips, enabled: open, staleTime: 60000})
    const {data: payments = []} = useQuery({queryKey: ['member-payments'], queryFn: api.getAllPayments, enabled: open, staleTime: 60000})
    const {data: expenses = []} = useQuery({queryKey: ['club-expenses'], queryFn: api.getExpenses, enabled: open, staleTime: 60000})

    // Reset the query on every open, and grab focus after Sheet's own open-focus effect has run.
    useEffect(() => {
        if (!open) return
        setQuery('')
        const id = setTimeout(() => inputRef.current?.focus(), 50)
        return () => clearTimeout(id)
    }, [open])

    const groups: { key: GroupKey; label: string; results: SearchResult[] }[] = useMemo(() => ([
        {key: 'member', label: t('search.members'), results: searchMembers(query, regularMembers)},
        {key: 'account', label: t('search.accounts'), results: searchAccounts(query, regularMembers)},
        {key: 'evening', label: t('search.evenings'), results: searchEvenings(query, evenings, locale)},
        {key: 'booking', label: t('search.bookings'), results: searchBookings(query, payments, expenses, locale)},
        {key: 'announcement', label: t('search.announcements'), results: searchAnnouncements(query, announcements)},
        {key: 'trip', label: t('search.trips'), results: searchTrips(query, trips, locale)},
    ]), [query, regularMembers, evenings, announcements, trips, payments, expenses, locale, t])

    const hasQuery = query.trim().length > 0
    const totalResults = groups.reduce((sum, g) => sum + g.results.length, 0)

    function select(r: SearchResult) {
        window.location.hash = r.hash
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
                placeholder={t('search.placeholder')}
            />
            <div className="flex flex-col gap-3 mt-3 max-h-[60vh] overflow-y-auto">
                {hasQuery && totalResults === 0 && (
                    <p className="text-xs text-kce-muted text-center py-4">{t('search.noResults')}</p>
                )}
                {hasQuery && groups.filter(g => g.results.length > 0).map(g => (
                    <div key={g.key}>
                        <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-1">
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
                                    <span className="text-sm text-kce-cream truncate">{r.title}</span>
                                    {r.subtitle && (
                                        <span className="text-[10px] text-kce-muted flex-shrink-0 ml-2">{r.subtitle}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Sheet>
    )
}
