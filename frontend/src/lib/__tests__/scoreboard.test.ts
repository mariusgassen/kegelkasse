import {describe, it, expect} from 'vitest'
import {
    availablePanels,
    initialWatch,
    nextPanel,
    observe,
    scoreboardToken,
    type ScoreboardData,
    type ScoreboardEvening,
    type ScoreboardGame,
    type ScoreboardThrow,
} from '../scoreboard'

function throwAt(id: number, pins: number, player_name: string | null = 'Rudi'): ScoreboardThrow {
    return {id, throw_num: id, pins, player_id: 1, player_name}
}

function game(over: Partial<ScoreboardGame> = {}): ScoreboardGame {
    return {
        id: 1, name: 'Eröffnung', is_opener: true, turn_mode: 'alternating',
        active_player: null, next_player: null, throws: [], standings: [], ...over,
    }
}

function evening(over: Partial<ScoreboardEvening> = {}): ScoreboardEvening {
    return {
        id: 1, date: '2026-07-23', venue: null, player_count: 0, game: null, last_result: null,
        penalty_ranking: [], drinks: {beer: 0, shots: 0, per_player: []}, king: null, highlight: null,
        totals: {penalty_euro: 0, games_finished: 0, games_total: 0}, ...over,
    }
}

function data(ev: ScoreboardEvening | null): ScoreboardData {
    return {
        club: {name: 'KC', logo_url: null, primary_color: '#e8a020', secondary_color: '#6b7c5a'},
        throw_tracking: true,
        evening: ev,
    }
}

describe('scoreboardToken', () => {
    it('reads the token out of a /tv path', () => {
        expect(scoreboardToken('/tv/abc-123')).toBe('abc-123')
        expect(scoreboardToken('/tv/abc-123/')).toBe('abc-123')
    })

    it('decodes a percent-encoded token', () => {
        expect(scoreboardToken('/tv/a%2Fb')).toBe('a/b')
    })

    it('ignores every other path', () => {
        expect(scoreboardToken('/')).toBeNull()
        expect(scoreboardToken('/treasury')).toBeNull()
        expect(scoreboardToken('/tv')).toBeNull()
        expect(scoreboardToken('/tv/')).toBeNull()
        expect(scoreboardToken('/tv/abc/extra')).toBeNull()
    })
})

describe('availablePanels', () => {
    it('is empty without an evening', () => {
        expect(availablePanels(null)).toEqual([])
        expect(availablePanels(data(null))).toEqual([])
    })

    it('is empty when nothing has happened yet', () => {
        expect(availablePanels(data(evening()))).toEqual([])
    })

    it('includes the ranking once somebody owes something', () => {
        expect(availablePanels(data(evening({penalty_ranking: [{name: 'Rudi', amount: 2}]}))))
            .toEqual(['ranking'])
    })

    it('includes drinks once a round was booked', () => {
        expect(availablePanels(data(evening({drinks: {beer: 0, shots: 1, per_player: []}}))))
            .toEqual(['drinks'])
    })

    it('includes a highlight that is text-only or media-only', () => {
        const text = evening({highlight: {text: 'Wahnsinn', media_url: null, created_at: 'x'}})
        const media = evening({highlight: {text: null, media_url: '/p.jpg', created_at: 'x'}})
        expect(availablePanels(data(text))).toEqual(['highlight'])
        expect(availablePanels(data(media))).toEqual(['highlight'])
    })

    it('skips an empty highlight record', () => {
        const ev = evening({highlight: {text: null, media_url: null, created_at: 'x'}})
        expect(availablePanels(data(ev))).toEqual([])
    })

    it('keeps a stable order across panels', () => {
        const ev = evening({
            penalty_ranking: [{name: 'Rudi', amount: 2}],
            drinks: {beer: 3, shots: 0, per_player: []},
            highlight: {text: 'Hui', media_url: null, created_at: 'x'},
        })
        expect(availablePanels(data(ev))).toEqual(['ranking', 'drinks', 'highlight'])
    })
})

describe('nextPanel', () => {
    it('returns null when nothing can be shown', () => {
        expect(nextPanel(null, [])).toBeNull()
        expect(nextPanel('ranking', [])).toBeNull()
    })

    it('starts at the first panel', () => {
        expect(nextPanel(null, ['ranking', 'drinks'])).toBe('ranking')
    })

    it('advances and wraps', () => {
        expect(nextPanel('ranking', ['ranking', 'drinks'])).toBe('drinks')
        expect(nextPanel('drinks', ['ranking', 'drinks'])).toBe('ranking')
    })

    it('stays put when only one panel is available', () => {
        expect(nextPanel('drinks', ['drinks'])).toBe('drinks')
    })

    it('falls back to the first panel when the current one disappeared', () => {
        expect(nextPanel('highlight', ['ranking', 'drinks'])).toBe('ranking')
    })
})

describe('observe', () => {
    it('seeds silently on the first payload', () => {
        const ev = evening({
            game: game({throws: [throwAt(1, 9)]}),
            king: {name: 'Rudi'},
        })
        const {watch, celebrations} = observe(initialWatch(), data(ev))
        expect(celebrations).toEqual([])
        expect(watch.seeded).toBe(true)
        expect(watch.throwIds).toEqual([1])
        expect(watch.kingName).toBe('Rudi')
    })

    it('celebrates a nine that arrives after seeding', () => {
        const first = observe(initialWatch(), data(evening({game: game({throws: [throwAt(1, 5)]})})))
        const second = observe(first.watch, data(evening({
            game: game({throws: [throwAt(1, 5), throwAt(2, 9, 'Grete')]}),
        })))
        expect(second.celebrations).toEqual([{kind: 'allnine', name: 'Grete'}])
    })

    it('celebrates the same nine only once', () => {
        const payload = data(evening({game: game({throws: [throwAt(1, 5)]})}))
        const withNine = data(evening({game: game({throws: [throwAt(1, 5), throwAt(2, 9)]})}))
        const a = observe(initialWatch(), payload)
        const b = observe(a.watch, withNine)
        const c = observe(b.watch, withNine)
        expect(b.celebrations).toHaveLength(1)
        expect(c.celebrations).toEqual([])
    })

    it('ignores throws below nine', () => {
        const a = observe(initialWatch(), data(evening({game: game({throws: []})})))
        const b = observe(a.watch, data(evening({game: game({throws: [throwAt(1, 8)]})})))
        expect(b.celebrations).toEqual([])
    })

    it('celebrates a crowning', () => {
        const a = observe(initialWatch(), data(evening()))
        const b = observe(a.watch, data(evening({king: {name: 'Rudi'}})))
        expect(b.celebrations).toEqual([{kind: 'king', name: 'Rudi'}])
    })

    it('does not re-celebrate the same king on every poll', () => {
        const crowned = data(evening({king: {name: 'Rudi'}}))
        const a = observe(initialWatch(), data(evening()))
        const b = observe(a.watch, crowned)
        const c = observe(b.watch, crowned)
        expect(b.celebrations).toHaveLength(1)
        expect(c.celebrations).toEqual([])
    })

    it('celebrates again when the crown moves to somebody else', () => {
        const a = observe(initialWatch(), data(evening({king: {name: 'Rudi'}})))
        const b = observe(a.watch, data(evening({king: {name: 'Grete'}})))
        expect(b.celebrations).toEqual([{kind: 'king', name: 'Grete'}])
    })

    it('remembers throw IDs across a game change so a stale nine cannot fire twice', () => {
        const a = observe(initialWatch(), data(evening({game: game({throws: [throwAt(7, 9)]})})))
        // Game finishes → payload has no game at all …
        const b = observe(a.watch, data(evening({game: null})))
        // … and the same throw is somehow reported again (a corrected/re-opened game).
        const c = observe(b.watch, data(evening({game: game({throws: [throwAt(7, 9)]})})))
        expect(b.celebrations).toEqual([])
        expect(c.celebrations).toEqual([])
    })

    it('handles a null payload without losing its state', () => {
        const a = observe(initialWatch(), data(evening({king: {name: 'Rudi'}})))
        const b = observe(a.watch, null)
        expect(b.celebrations).toEqual([])
        expect(b.watch.seeded).toBe(true)
    })

    it('reports several nines from one payload', () => {
        const a = observe(initialWatch(), data(evening({game: game({throws: []})})))
        const b = observe(a.watch, data(evening({
            game: game({throws: [throwAt(1, 9, 'Rudi'), throwAt(2, 9, 'Grete')]}),
        })))
        expect(b.celebrations).toEqual([
            {kind: 'allnine', name: 'Rudi'},
            {kind: 'allnine', name: 'Grete'},
        ])
    })
})
