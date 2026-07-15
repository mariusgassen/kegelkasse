import type {WrappedStats} from '../types'

export type WrappedAccent = 'primary' | 'amber' | 'red' | 'green' | 'cream'

export interface WrappedCard {
    id: string
    emoji: string
    /** i18n key for the card headline. */
    headlineKey: string
    /** Pre-formatted big value (numbers/€ already formatted). */
    value: string
    /** Optional i18n key rendered below the value. */
    subtextKey?: string
    /** Optional dynamic text appended to / used instead of the subtext key. */
    subtextValue?: string
    accent: WrappedAccent
}

/**
 * Build the ordered card deck for a member's Kegel-Wrapped year recap.
 *
 * Pure transform of {@link WrappedStats} → cards. Cards with no underlying data
 * are skipped (e.g. no throws → no pins card), so the deck only ever shows
 * meaningful pages. The intro card is always first and the title finale last.
 *
 * i18n keys are returned rather than resolved strings so the function stays
 * pure and unit-testable; the component resolves `headlineKey` / `subtextKey`
 * via `t()` and renders `value` / `subtextValue` verbatim.
 */
export function buildWrappedCards(s: WrappedStats, fe: (v: number) => string): WrappedCard[] {
    const cards: WrappedCard[] = []

    cards.push({
        id: 'intro',
        emoji: '🎳',
        headlineKey: 'wrapped.card.intro',
        value: String(s.year),
        subtextKey: 'wrapped.card.intro.sub',
        accent: 'primary',
    })

    if (s.evenings_attended > 0) {
        cards.push({
            id: 'attendance',
            emoji: '📅',
            headlineKey: 'wrapped.card.attendance',
            value: `${s.evenings_attended} / ${s.total_evenings}`,
            subtextKey: 'wrapped.card.attendance.sub',
            subtextValue: `${s.attendance_pct}%`,
            accent: 'cream',
        })
    }

    if (s.penalty_count > 0) {
        cards.push({
            id: 'penalties',
            emoji: '💸',
            headlineKey: 'wrapped.card.penalties',
            value: fe(s.penalty_total),
            subtextKey: 'wrapped.card.penalties.sub',
            subtextValue: String(s.penalty_count),
            accent: 'red',
        })
    }

    if (s.biggest_penalty) {
        cards.push({
            id: 'biggest',
            emoji: '💥',
            headlineKey: 'wrapped.card.biggest',
            value: fe(s.biggest_penalty.amount),
            subtextValue: `${s.biggest_penalty.icon} ${s.biggest_penalty.name}`,
            accent: 'red',
        })
    }

    if (s.top_penalty_type) {
        cards.push({
            id: 'favorite',
            emoji: s.top_penalty_type.icon,
            headlineKey: 'wrapped.card.favorite',
            value: `${s.top_penalty_type.count}×`,
            subtextValue: s.top_penalty_type.name,
            accent: 'amber',
        })
    }

    if (s.king_count > 0) {
        cards.push({
            id: 'king',
            emoji: '👑',
            headlineKey: 'wrapped.card.king',
            value: `${s.king_count}×`,
            subtextKey: 'wrapped.card.king.sub',
            accent: 'amber',
        })
    }

    if (s.game_wins > 0) {
        cards.push({
            id: 'wins',
            emoji: '🏆',
            headlineKey: 'wrapped.card.wins',
            value: String(s.game_wins),
            subtextKey: 'wrapped.card.wins.sub',
            accent: 'amber',
        })
    }

    if (s.total_beers + s.total_shots > 0) {
        cards.push({
            id: 'drinks',
            emoji: '🍺',
            headlineKey: 'wrapped.card.drinks',
            value: `🍺 ${s.total_beers}  🥃 ${s.total_shots}`,
            subtextKey: 'wrapped.card.drinks.sub',
            accent: 'green',
        })
    }

    if (s.avg_pins !== null) {
        cards.push({
            id: 'throws',
            emoji: '🎳',
            headlineKey: 'wrapped.card.throws',
            value: String(s.avg_pins),
            subtextKey: 'wrapped.card.throws.sub',
            subtextValue: s.best_avg_pins !== null ? String(s.best_avg_pins) : undefined,
            accent: 'cream',
        })
    }

    if (s.penalty_rank !== null) {
        cards.push({
            id: 'rank',
            emoji: '🏅',
            headlineKey: 'wrapped.card.rank',
            value: `#${s.penalty_rank}`,
            subtextKey: 'wrapped.card.rank.sub',
            subtextValue: String(s.ranked_members),
            accent: 'primary',
        })
    }

    cards.push({
        id: 'finale',
        emoji: s.title_icon,
        headlineKey: 'wrapped.card.finale',
        value: '',
        subtextKey: `wrapped.title.${s.title_key}`,
        accent: 'primary',
    })

    return cards
}
