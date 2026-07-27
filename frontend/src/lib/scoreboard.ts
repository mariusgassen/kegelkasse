/**
 * Pure derivations for the TV/beamer scoreboard (#74).
 *
 * The scoreboard is a display, not an app: it never mutates anything, and everything it shows is a
 * projection of one public payload. Keeping the projection here means the page stays a renderer and
 * the two things that are actually easy to get wrong — when a celebration fires, and which standing
 * panel is on screen — are unit-testable.
 */

export interface ScoreboardThrow {
    id: number
    throw_num: number
    pins: number
    player_id: number | null
    player_name: string | null
}

export interface ScoreboardStanding {
    player_id: number
    name: string
    pins: number
    throws: number
}

export interface ScoreboardGame {
    id: number
    name: string
    is_opener: boolean
    turn_mode: string | null
    active_player: {id: number; name: string} | null
    next_player: {id: number; name: string} | null
    throws: ScoreboardThrow[]
    standings: ScoreboardStanding[]
}

export interface ScoreboardEvening {
    id: number
    date: string | null
    venue: string | null
    player_count: number
    game: ScoreboardGame | null
    last_result: {name: string; winner_name: string | null} | null
    penalty_ranking: {name: string; amount: number}[]
    drinks: {beer: number; shots: number; per_player: {name: string; count: number}[]}
    king: {name: string} | null
    highlight: {text: string | null; media_url: string | null; created_at: string} | null
    totals: {penalty_euro: number; games_finished: number; games_total: number}
}

export interface ScoreboardData {
    club: {name: string; logo_url: string | null; primary_color: string; secondary_color: string}
    throw_tracking: boolean
    evening: ScoreboardEvening | null
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * The scoreboard token in a URL path, or null for every other path.
 *
 * `main.tsx` picks the scoreboard over <App/> with this, because the TV must render without ever
 * touching the boot/auth flow — a television has nobody to log it in, and the router only mounts
 * once a user is authenticated.
 */
export function scoreboardToken(pathname: string): string | null {
    const m = /^\/tv\/([^/?#]+)\/?$/.exec(pathname)
    return m ? decodeURIComponent(m[1]) : null
}

// ── Rotating standings panels ────────────────────────────────────────────────

export type PanelId = 'ranking' | 'drinks' | 'highlight'

const PANEL_ORDER: PanelId[] = ['ranking', 'drinks', 'highlight']

/**
 * Which standings panels have something to show. A panel with no data is skipped entirely rather
 * than rotated to as an empty screen — on a TV nobody is there to explain the blank.
 */
export function availablePanels(data: ScoreboardData | null): PanelId[] {
    const e = data?.evening
    if (!e) return []
    return PANEL_ORDER.filter(id => {
        if (id === 'ranking') return e.penalty_ranking.length > 0
        if (id === 'drinks') return e.drinks.beer > 0 || e.drinks.shots > 0
        return !!e.highlight && (!!e.highlight.media_url || !!e.highlight.text)
    })
}

/**
 * The next panel in the rotation. Returns null when nothing can be shown, and keeps the current
 * panel when it is the only one available (so a single-panel evening doesn't flicker).
 */
export function nextPanel(current: PanelId | null, panels: PanelId[]): PanelId | null {
    if (panels.length === 0) return null
    const idx = current == null ? -1 : panels.indexOf(current)
    return panels[(idx + 1) % panels.length]
}

// ── Celebrations ─────────────────────────────────────────────────────────────

export type CelebrationKind = 'king' | 'allnine'

export interface Celebration {
    kind: CelebrationKind
    /** Who it is for — the crowned king, or whoever threw the nine (null if the throw is unassigned). */
    name: string | null
}

/** Pins that count as "Alle Neune" — a cleared rack in the nine-pin game. */
export const ALL_NINE = 9

/**
 * What the scoreboard has already seen. Carried across payloads by the page so a celebration fires
 * exactly once, no matter how often the same payload is re-polled.
 *
 * `seeded` is the important field: the first payload a freshly-opened TV receives can contain a
 * whole evening's worth of nines and an already-crowned king. Those are history, not news, so the
 * first observation only records state.
 */
export interface ScoreboardWatch {
    /** Throw IDs already accounted for. IDs are DB-unique, so this is safe across games. */
    throwIds: number[]
    kingName: string | null
    seeded: boolean
}

export function initialWatch(): ScoreboardWatch {
    return {throwIds: [], kingName: null, seeded: false}
}

/**
 * Fold a new payload into the watch state, returning the celebrations it introduced.
 *
 * Pure: it takes the previous state and returns a new one, so the page can hold it in a ref without
 * this module owning any state of its own.
 */
export function observe(watch: ScoreboardWatch, data: ScoreboardData | null): {
    watch: ScoreboardWatch
    celebrations: Celebration[]
} {
    const throws = data?.evening?.game?.throws ?? []
    const kingName = data?.evening?.king?.name ?? null
    const known = new Set(watch.throwIds)

    const celebrations: Celebration[] = []
    if (watch.seeded) {
        for (const t of throws) {
            if (t.pins >= ALL_NINE && !known.has(t.id)) {
                celebrations.push({kind: 'allnine', name: t.player_name})
            }
        }
        // A crown is news when it appears, or when it moves to somebody else (a corrected result).
        if (kingName && kingName !== watch.kingName) {
            celebrations.push({kind: 'king', name: kingName})
        }
    }

    // Only the running game's throws are in the payload, so the ID list would otherwise grow with
    // every game and never shrink. Keep the ones still on screen plus the previous game's, which is
    // enough to bridge the poll that switches games.
    const retained = watch.throwIds.slice(-200)
    const merged = new Set([...retained, ...throws.map(t => t.id)])

    return {
        watch: {throwIds: [...merged], kingName, seeded: true},
        celebrations,
    }
}
