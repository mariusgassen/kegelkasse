// Pure matching logic for the global search overlay. Each result carries the exact hash
// fragment the destination page already knows how to consume as a deep link (memberName on
// MembersPage, member on TreasuryPage's accounts tab, evening on SchedulePage, item on
// CommitteePage) — this module never navigates itself, it only decides what to show.

export type SearchResultKind = 'member' | 'account' | 'evening' | 'announcement' | 'trip'

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

const RESULT_LIMIT = 5

function matches(haystack: string | null | undefined, q: string): boolean {
    return !!haystack && haystack.toLowerCase().includes(q)
}

function displayName(m: MemberLike): string {
    return m.nickname || m.name
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

export function searchEvenings(query: string, evenings: EveningLike[]): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return evenings
        .filter(e => matches(e.date, q) || matches(e.venue, q))
        .slice(0, RESULT_LIMIT)
        .map(e => ({
            kind: 'evening' as const,
            id: e.id,
            title: e.venue || e.date,
            subtitle: e.venue ? e.date : undefined,
            hash: `schedule?evening=${e.id}`,
        }))
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

export function searchTrips(query: string, items: TripLike[]): SearchResult[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return items
        .filter(t => matches(t.destination, q) || matches(t.note, q))
        .slice(0, RESULT_LIMIT)
        .map(t => ({
            kind: 'trip' as const,
            id: t.id,
            title: t.destination,
            subtitle: t.date,
            hash: `committee:trips?item=${t.id}`,
        }))
}
