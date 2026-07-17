// Pure matching logic for the global search overlay. Each result carries the exact hash
// fragment the destination page already knows how to consume as a deep link (memberName on
// MembersPage, member/q on TreasuryPage's accounts/bookings tabs, evening on SchedulePage, item
// on CommitteePage) — this module never navigates itself, it only decides what to show.

import type {Locale} from '@/i18n'

export type SearchResultKind = 'member' | 'account' | 'evening' | 'announcement' | 'trip' | 'payment' | 'expense'

export interface SearchResult {
    kind: SearchResultKind
    id: number
    title: string
    subtitle?: string
    /** Hash fragment (without leading '#') to assign to window.location.hash on selection. */
    hash: string
}

export interface MemberLike {
    id: number
    name: string
    nickname?: string | null
}

export interface EveningLike {
    id: number
    date: string
    venue?: string | null
}

export interface AnnouncementLike {
    id: number
    title: string
    text?: string | null
}

export interface TripLike {
    id: number
    destination: string
    date: string
    note?: string | null
}

export interface PaymentLike {
    id: number
    member_name: string
    amount: number
    note?: string | null
    date?: string | null
    created_at?: string | null
}

export interface ExpenseLike {
    id: number
    description: string
    amount: number
    date?: string | null
    created_at?: string | null
}

const RESULT_LIMIT = 5

function matches(haystack: string | null | undefined, q: string): boolean {
    return !!haystack && haystack.toLowerCase().includes(q)
}

function displayName(m: MemberLike): string {
    return m.nickname || m.name
}

function toDate(dateStr: string): Date {
    // Date-only strings (YYYY-MM-DD) anchor to local midnight to avoid a UTC/local day shift
    // near midnight; full timestamps parse as-is.
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00` : dateStr
    return new Date(iso)
}

/** Locale-aware long-form date ("15. März 2026" / "March 15, 2026") for display and for matching a written-out month name. */
export function formatSearchDate(dateStr: string | null | undefined, locale: Locale): string | undefined {
    if (!dateStr) return undefined
    const d = toDate(dateStr)
    if (isNaN(d.getTime())) return undefined
    return d.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {day: '2-digit', month: 'long', year: 'numeric'})
}

function matchesDate(dateStr: string | null | undefined, q: string, locale: Locale): boolean {
    const formatted = formatSearchDate(dateStr, locale)
    return !!formatted && formatted.toLowerCase().includes(q)
}

export function searchMembers(query: string, members: MemberLike[]): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return members
        .filter(m => matches(m.name, q) || matches(m.nickname, q))
        .slice(0, RESULT_LIMIT)
        .map(m => ({
            kind: 'member' as const,
            id: m.id,
            title: displayName(m),
            hash: `members?memberName=${encodeURIComponent(displayName(m))}`,
        }))
}

export function searchAccounts(query: string, members: MemberLike[]): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return members
        .filter(m => matches(m.name, q) || matches(m.nickname, q))
        .slice(0, RESULT_LIMIT)
        .map(m => ({
            kind: 'account' as const,
            id: m.id,
            title: displayName(m),
            hash: `treasury:accounts?member=${m.id}`,
        }))
}

export function searchEvenings(query: string, evenings: EveningLike[], locale: Locale): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return evenings
        .filter(e => matches(e.date, q) || matches(e.venue, q) || matchesDate(e.date, q, locale))
        .slice(0, RESULT_LIMIT)
        .map(e => {
            const formatted = formatSearchDate(e.date, locale) ?? e.date
            return {
                kind: 'evening' as const,
                id: e.id,
                title: e.venue || formatted,
                subtitle: e.venue ? formatted : undefined,
                hash: `schedule?evening=${e.id}`,
            }
        })
}

export function searchAnnouncements(query: string, items: AnnouncementLike[]): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return items
        .filter(a => matches(a.title, q) || matches(a.text, q))
        .slice(0, RESULT_LIMIT)
        .map(a => ({
            kind: 'announcement' as const,
            id: a.id,
            title: a.title,
            hash: `committee:announcements?item=${a.id}`,
        }))
}

export function searchTrips(query: string, items: TripLike[], locale: Locale): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return items
        .filter(t => matches(t.destination, q) || matches(t.note, q) || matchesDate(t.date, q, locale))
        .slice(0, RESULT_LIMIT)
        .map(t => ({
            kind: 'trip' as const,
            id: t.id,
            title: t.destination,
            subtitle: formatSearchDate(t.date, locale) ?? t.date,
            hash: `committee:trips?item=${t.id}`,
        }))
}

/** Member payments and club expenses (the "Kassenbuch"), combined and capped like every other category. */
export function searchBookings(query: string, payments: PaymentLike[], expenses: ExpenseLike[], locale: Locale): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const paymentResults: SearchResult[] = payments
        .filter(p => matches(p.member_name, q) || matches(p.note, q) || matchesDate(p.date ?? p.created_at, q, locale))
        .map(p => ({
            kind: 'payment' as const,
            id: p.id,
            title: p.note || p.member_name,
            subtitle: [p.member_name, formatSearchDate(p.date ?? p.created_at, locale)].filter(Boolean).join(' · '),
            hash: `treasury:bookings?q=${encodeURIComponent(p.note || p.member_name)}`,
        }))

    const expenseResults: SearchResult[] = expenses
        .filter(e => matches(e.description, q) || matchesDate(e.date ?? e.created_at, q, locale))
        .map(e => ({
            kind: 'expense' as const,
            id: e.id,
            title: e.description,
            subtitle: formatSearchDate(e.date ?? e.created_at, locale),
            hash: `treasury:bookings?q=${encodeURIComponent(e.description)}`,
        }))

    return [...paymentResults, ...expenseResults].slice(0, RESULT_LIMIT)
}
