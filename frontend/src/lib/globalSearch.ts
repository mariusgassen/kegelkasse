// Pure matching logic for the global search overlay. Each result carries a typed router
// navigation target (`nav: {to, search}`) the destination page already knows how to consume as
// a deep link (memberName on MembersPage, member/q on TreasuryPage's accounts/bookings tabs,
// evening on SchedulePage, item on CommitteePage) — this module never navigates itself, it only
// decides what to show.

import type {Locale} from '@/i18n'
import type {RoutePage} from '@/lib/legacyHash'

export type SearchResultKind = 'member' | 'account' | 'evening' | 'announcement' | 'trip' | 'sticker' | 'payment' | 'expense'

/** A typed router navigation target — `to` is constrained to a real route path. */
export interface SearchNav {
    to: `/${RoutePage}`
    search: Record<string, string | number>
}

export interface SearchResult {
    kind: SearchResultKind
    id: number
    title: string
    subtitle?: string
    /** Typed router navigation target assigned to the result on selection. */
    nav: SearchNav
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

export interface StickerLike {
    id: number
    place_name: string
    caption?: string | null
    created_by_name?: string | null
    stuck_on?: string | null
    created_at?: string | null
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
            nav: {to: '/members', search: {memberName: displayName(m)}},
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
            nav: {to: '/treasury', search: {tab: 'accounts', member: m.id}},
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
                nav: {to: '/schedule', search: {evening: e.id}},
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
            nav: {to: '/committee', search: {tab: 'announcements', item: a.id}},
        }))
}

const STICKER_KEYWORDS = ['sticker', 'stickers', 'aufkleber', 'stickerwand', 'sticker-wand']
const MAP_KEYWORDS = ['karte', 'map', 'weltkarte', 'worldmap']

function isStickerKeyword(w: string): boolean {
    const s = w.toLowerCase()
    return STICKER_KEYWORDS.some(k => k.startsWith(s) || s.startsWith(k))
}

function isMapKeyword(w: string): boolean {
    const s = w.toLowerCase()
    return MAP_KEYWORDS.some(k => k.startsWith(s) || s.startsWith(k))
}

export function searchStickers(query: string, items: StickerLike[], locale?: Locale): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const words = q.split(/\s+/).filter(Boolean)
    const hasStickerWord = words.some(isStickerKeyword)
    const hasMapWord = words.some(isMapKeyword)
    const remainingWords = words.filter(w => !isStickerKeyword(w) && !isMapKeyword(w))

    let matchingItems: StickerLike[] = []
    if (remainingWords.length > 0) {
        matchingItems = items.filter(s =>
            remainingWords.every(w =>
                matches(s.place_name, w) ||
                matches(s.caption, w) ||
                matches(s.created_by_name, w) ||
                (locale && matchesDate(s.stuck_on ?? s.created_at, w, locale))
            )
        )
    } else if (hasStickerWord || hasMapWord) {
        matchingItems = items
    } else {
        matchingItems = items.filter(s =>
            matches(s.place_name, q) ||
            matches(s.caption, q) ||
            matches(s.created_by_name, q) ||
            (locale && matchesDate(s.stuck_on ?? s.created_at, q, locale))
        )
    }

    const results: SearchResult[] = []

    if ((hasStickerWord || hasMapWord) && remainingWords.length === 0) {
        const isMap = hasMapWord && !hasStickerWord
        const title = isMap
            ? (locale === 'en' ? 'Sticker map' : 'Sticker-Weltkarte')
            : (locale === 'en' ? 'Sticker wall' : 'Sticker-Wand')
        const subtitle = isMap
            ? (locale === 'en' ? 'World map' : 'Weltkarte')
            : (locale === 'en' ? 'Feed & map' : 'Feed & Weltkarte')
        results.push({
            kind: 'sticker',
            id: 0,
            title,
            subtitle,
            nav: {to: '/stickers', search: {tab: isMap ? 'map' : 'feed'}},
        })
    }

    const stickerResults: SearchResult[] = matchingItems
        .slice(0, RESULT_LIMIT - results.length)
        .map(s => ({
            kind: 'sticker' as const,
            id: s.id,
            title: s.place_name,
            subtitle: [
                s.caption,
                s.created_by_name,
                locale ? formatSearchDate(s.stuck_on ?? s.created_at, locale) : undefined,
            ].filter(Boolean).join(' · ') || undefined,
            nav: {to: '/stickers', search: {tab: 'feed', item: s.id}},
        }))

    return [...results, ...stickerResults].slice(0, RESULT_LIMIT)
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
            nav: {to: '/committee', search: {tab: 'trips', item: t.id}},
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
            nav: {to: '/treasury', search: {tab: 'bookings', q: p.note || p.member_name}},
        }))

    const expenseResults: SearchResult[] = expenses
        .filter(e => matches(e.description, q) || matchesDate(e.date ?? e.created_at, q, locale))
        .map(e => ({
            kind: 'expense' as const,
            id: e.id,
            title: e.description,
            subtitle: formatSearchDate(e.date ?? e.created_at, locale),
            nav: {to: '/treasury', search: {tab: 'bookings', q: e.description}},
        }))

    return [...paymentResults, ...expenseResults].slice(0, RESULT_LIMIT)
}
