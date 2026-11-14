import type {RegularMember} from '../types'

export interface NameEntry {
    id: number | string
    name: string
    nickname?: string | null
}

const norm = (s: string) => s.trim().toLocaleLowerCase()

/**
 * Display labels for a group of people shown together (e.g. the guests of one evening).
 * Prefers the Kegelname (nickname), and falls back to progressively more specific
 * labels only for entries whose label would otherwise be ambiguous:
 * nickname -> full name -> "nickname (full name)" -> numbered.
 */
export function disambiguatedNames(entries: NameEntry[]): Map<NameEntry['id'], string> {
    const levels = (e: NameEntry): string[] => {
        const nick = e.nickname?.trim()
        const full = e.name.trim()
        const out = [nick || full]
        if (nick) out.push(full, `${nick} (${full})`)
        return out
    }
    const result = new Map<NameEntry['id'], string>()
    let pending = entries
    for (let level = 0; pending.length > 0; level++) {
        const counts = new Map<string, number>()
        for (const e of pending) {
            const l = levels(e)[Math.min(level, levels(e).length - 1)]
            counts.set(norm(l), (counts.get(norm(l)) ?? 0) + 1)
        }
        const next: NameEntry[] = []
        for (const e of pending) {
            const ls = levels(e)
            const label = ls[Math.min(level, ls.length - 1)]
            const unique = counts.get(norm(label)) === 1 && !isTaken(result, label)
            if (unique || level >= ls.length - 1) {
                result.set(e.id, label)
            } else next.push(e)
        }
        pending = next
        if (level > 4) break
    }
    // Truly identical labels (same name twice): number them.
    const seen = new Map<string, number>()
    const total = new Map<string, number>()
    for (const l of result.values()) total.set(norm(l), (total.get(norm(l)) ?? 0) + 1)
    for (const [id, l] of result) {
        if ((total.get(norm(l)) ?? 0) > 1) {
            const n = (seen.get(norm(l)) ?? 0) + 1
            seen.set(norm(l), n)
            result.set(id, `${l} (${n})`)
        }
    }
    return result
}

function isTaken(result: Map<unknown, string>, label: string): boolean {
    for (const l of result.values()) if (norm(l) === norm(label)) return true
    return false
}

/** Labels for scheduled-evening guests, using the linked roster member's Kegelname when known. */
export function scheduledGuestLabels(
    guests: {id: number; name: string; regular_member_id: number | null}[],
    regularMembers: RegularMember[],
): Map<number, string> {
    const byId = new Map(regularMembers.map(m => [m.id, m]))
    const m = disambiguatedNames(guests.map(g => ({
        id: g.id,
        name: g.name,
        nickname: g.regular_member_id != null ? byId.get(g.regular_member_id)?.nickname : null,
    })))
    return m as Map<number, string>
}

/** Labels for roster members shown as a group (e.g. known-guest chips). */
export function memberLabels(members: RegularMember[]): Map<number, string> {
    return disambiguatedNames(members) as Map<number, string>
}
