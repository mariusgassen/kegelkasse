import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {computeEveningRecap, renderRecapCardImage, shareOrDownloadRecapImage} from '../recapCard'
import type {Evening} from '@/types'

function baseEvening(over: Partial<Evening> = {}): Evening {
    return {
        id: 1, date: '2026-03-10', venue: 'Gasthaus Krone', note: null,
        is_closed: true, ended_at: null, season_closed: false,
        players: [], teams: [], penalty_log: [], games: [], drink_rounds: [], highlights: [],
        ...over,
    }
}

describe('computeEveningRecap', () => {
    it('returns null for a missing evening', () => {
        expect(computeEveningRecap(null)).toBeNull()
        expect(computeEveningRecap(undefined)).toBeNull()
    })

    it('passes through date, venue and player count', () => {
        const ev = baseEvening({
            players: [
                {id: 1, name: 'Hans', nickname: null, regular_member_id: 1, team_id: null, is_king: false},
                {id: 2, name: 'Tina', nickname: null, regular_member_id: 2, team_id: null, is_king: false},
            ],
        })
        const recap = computeEveningRecap(ev)!
        expect(recap.date).toBe('2026-03-10')
        expect(recap.venue).toBe('Gasthaus Krone')
        expect(recap.playerCount).toBe(2)
    })

    it('finds the king from the players list', () => {
        const ev = baseEvening({
            players: [
                {id: 1, name: 'Hans', nickname: 'Hansi', regular_member_id: 1, team_id: null, is_king: true},
                {id: 2, name: 'Tina', nickname: null, regular_member_id: 2, team_id: null, is_king: false},
            ],
        })
        expect(computeEveningRecap(ev)!.kingName).toBe('Hansi')
    })

    it('king is null when nobody was crowned', () => {
        const ev = baseEvening({
            players: [{id: 1, name: 'Hans', nickname: null, regular_member_id: 1, team_id: null, is_king: false}],
        })
        expect(computeEveningRecap(ev)!.kingName).toBeNull()
    })

    it('prefers nickname over name for the king', () => {
        const ev = baseEvening({
            players: [{id: 1, name: 'Hans', nickname: 'Der Hammer', regular_member_id: 1, team_id: null, is_king: true}],
        })
        expect(computeEveningRecap(ev)!.kingName).toBe('Der Hammer')
    })

    it('finds the single highest euro-mode penalty', () => {
        const ev = baseEvening({
            penalty_log: [
                {id: 1, player_id: 1, team_id: null, player_name: 'Hans', penalty_type_name: 'Zu spät', icon: '⏰', amount: 1, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: 1},
                {id: 2, player_id: 2, team_id: null, player_name: 'Tina', penalty_type_name: 'Bank', icon: '🎳', amount: 5, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: 2},
            ],
        })
        const top = computeEveningRecap(ev)!.topPenalty!
        expect(top.playerName).toBe('Tina')
        expect(top.typeName).toBe('Bank')
        expect(top.amount).toBe(5)
    })

    it('converts count-mode penalties (amount × unit_amount) before comparing', () => {
        const ev = baseEvening({
            penalty_log: [
                {id: 1, player_id: 1, team_id: null, player_name: 'Hans', penalty_type_name: 'Null', icon: '🎳', amount: 4, mode: 'count', unit_amount: 0.5, regular_member_id: null, game_id: null, client_timestamp: 1},
                {id: 2, player_id: 2, team_id: null, player_name: 'Tina', penalty_type_name: 'Bank', icon: '🎳', amount: 1, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: 2},
            ],
        })
        // 4 × 0.5 = 2.0 > 1.0
        const top = computeEveningRecap(ev)!.topPenalty!
        expect(top.playerName).toBe('Hans')
        expect(top.amount).toBe(2)
    })

    it('topPenalty is null when there are no penalties', () => {
        expect(computeEveningRecap(baseEvening())!.topPenalty).toBeNull()
    })

    it('excludes absence penalties (player_id null) from topPenalty — a no-show fee is not a fun highlight', () => {
        const ev = baseEvening({
            penalty_log: [
                {id: 1, player_id: null, team_id: null, player_name: 'Klaus', penalty_type_name: 'Abwesenheit', icon: '🏠', amount: 10, mode: 'euro', unit_amount: null, regular_member_id: 3, game_id: null, client_timestamp: 1},
                {id: 2, player_id: 2, team_id: null, player_name: 'Tina', penalty_type_name: 'Bank', icon: '🎳', amount: 1, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: 2},
            ],
        })
        const top = computeEveningRecap(ev)!.topPenalty!
        expect(top.playerName).toBe('Tina')
        expect(top.amount).toBe(1)
    })

    it('topPenalty is null when only absence penalties were logged', () => {
        const ev = baseEvening({
            penalty_log: [
                {id: 1, player_id: null, team_id: null, player_name: 'Klaus', penalty_type_name: 'Abwesenheit', icon: '🏠', amount: 10, mode: 'euro', unit_amount: null, regular_member_id: 3, game_id: null, client_timestamp: 1},
            ],
        })
        expect(computeEveningRecap(ev)!.topPenalty).toBeNull()
    })

    it('sums total penalty euro across mixed euro/count modes, including absence entries', () => {
        const ev = baseEvening({
            penalty_log: [
                {id: 1, player_id: 1, team_id: null, player_name: 'Hans', penalty_type_name: 'A', icon: '🎳', amount: 2, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: 1},
                {id: 2, player_id: 2, team_id: null, player_name: 'Tina', penalty_type_name: 'B', icon: '🎳', amount: 3, mode: 'count', unit_amount: 0.5, regular_member_id: null, game_id: null, client_timestamp: 2},
                {id: 3, player_id: null, team_id: null, player_name: 'Klaus', penalty_type_name: 'Abwesenheit', icon: '🏠', amount: 4, mode: 'euro', unit_amount: null, regular_member_id: 3, game_id: null, client_timestamp: 3},
            ],
        })
        // 2 + (3 × 0.5) + 4 = 7.5 — absence entries still count toward the pot, just not the headline
        expect(computeEveningRecap(ev)!.totalPenaltyEuro).toBeCloseTo(7.5)
    })

    it('finds the player with the most drink round participations', () => {
        const ev = baseEvening({
            players: [
                {id: 1, name: 'Hans', nickname: null, regular_member_id: 1, team_id: null, is_king: false},
                {id: 2, name: 'Tina', nickname: null, regular_member_id: 2, team_id: null, is_king: false},
            ],
            drink_rounds: [
                {id: 1, drink_type: 'beer', variety: null, participant_ids: [1, 2], client_timestamp: 1},
                {id: 2, drink_type: 'beer', variety: null, participant_ids: [1], client_timestamp: 2},
                {id: 3, drink_type: 'shots', variety: null, participant_ids: [1], client_timestamp: 3},
            ],
        })
        const top = computeEveningRecap(ev)!.topDrinker!
        expect(top.name).toBe('Hans')
        expect(top.count).toBe(3)
    })

    it('topDrinker is null when there are no drink rounds', () => {
        expect(computeEveningRecap(baseEvening())!.topDrinker).toBeNull()
    })

    it('ignores a drink round participant that is not in the players list', () => {
        const ev = baseEvening({
            players: [{id: 1, name: 'Hans', nickname: null, regular_member_id: 1, team_id: null, is_king: false}],
            drink_rounds: [{id: 1, drink_type: 'beer', variety: null, participant_ids: [1, 999], client_timestamp: 1}],
        })
        const top = computeEveningRecap(ev)!.topDrinker!
        expect(top.name).toBe('Hans')
        expect(top.count).toBe(1)
    })

    it('counts beer and shot rounds separately', () => {
        const ev = baseEvening({
            drink_rounds: [
                {id: 1, drink_type: 'beer', variety: null, participant_ids: [], client_timestamp: 1},
                {id: 2, drink_type: 'beer', variety: null, participant_ids: [], client_timestamp: 2},
                {id: 3, drink_type: 'shots', variety: null, participant_ids: [], client_timestamp: 3},
            ],
        })
        const recap = computeEveningRecap(ev)!
        expect(recap.beerRounds).toBe(2)
        expect(recap.shotRounds).toBe(1)
    })

    it('counts only finished games', () => {
        const ev = baseEvening({
            games: [
                {id: 1, name: 'A', template_id: null, is_opener: false, winner_type: 'individual', turn_mode: 'alternating', winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0, per_point_penalty: 0, note: null, sort_order: 0, status: 'finished', started_at: null, finished_at: null, client_timestamp: 0, active_player_id: null, throws: []},
                {id: 2, name: 'B', template_id: null, is_opener: false, winner_type: 'individual', turn_mode: 'alternating', winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0, per_point_penalty: 0, note: null, sort_order: 0, status: 'open', started_at: null, finished_at: null, client_timestamp: 0, active_player_id: null, throws: []},
            ],
        })
        expect(computeEveningRecap(ev)!.gamesFinished).toBe(1)
    })
})

// ── renderRecapCardImage ──

class FakeCtx2D {
    fillStyle = ''
    strokeStyle = ''
    font = ''
    textAlign = 'left'
    textBaseline = 'alphabetic'
    fillRect = vi.fn()
    fillText = vi.fn()
    beginPath = vi.fn()
    closePath = vi.fn()
    arc = vi.fn()
    clip = vi.fn()
    save = vi.fn()
    restore = vi.fn()
    drawImage = vi.fn()
    fill = vi.fn()
    stroke = vi.fn()
    moveTo = vi.fn()
    lineTo = vi.fn()
}

const THEME = {canvas: '#111', ink: '#eee', muted: '#999', accent: '#e8a020', onAccent: '#000', line: '#333'}
const LABELS = {
    title: 'Recap', dateLine: '10.03.2026 · Krone', king: 'König', topPenalty: 'Teuerste Strafe',
    topDrinker: 'Durstigster', total: 'Kasse', games: 'Spiele', footer: 'Kegelkasse',
}

function baseRecap() {
    return computeEveningRecap(baseEvening({
        players: [{id: 1, name: 'Hans', nickname: null, regular_member_id: 1, team_id: null, is_king: true}],
        penalty_log: [{id: 1, player_id: 1, team_id: null, player_name: 'Hans', penalty_type_name: 'Bank', icon: '🎳', amount: 3, mode: 'euro', unit_amount: null, regular_member_id: null, game_id: null, client_timestamp: 1}],
        drink_rounds: [{id: 1, drink_type: 'beer', variety: null, participant_ids: [1], client_timestamp: 1}],
        games: [{id: 1, name: 'A', template_id: null, is_opener: false, winner_type: 'individual', turn_mode: 'alternating', winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0, per_point_penalty: 0, note: null, sort_order: 0, status: 'finished', started_at: null, finished_at: null, client_timestamp: 0, active_player_id: null, throws: []}],
    }))!
}

describe('renderRecapCardImage', () => {
    let fakeCtx: FakeCtx2D
    let toBlobResult: Blob | null

    beforeEach(() => {
        fakeCtx = new FakeCtx2D()
        toBlobResult = new Blob(['png'], {type: 'image/png'})
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeCtx as any)
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
            cb(toBlobResult)
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('resolves a PNG blob with no logo configured', async () => {
        const blob = await renderRecapCardImage(baseRecap(), THEME, {clubName: 'KC Testverein', logoUrl: null}, LABELS)
        expect(blob).toBeInstanceOf(Blob)
        expect(fakeCtx.fillText).toHaveBeenCalled()
    })

    it('draws the club initial badge when there is no logo', async () => {
        await renderRecapCardImage(baseRecap(), THEME, {clubName: 'Kegelclub', logoUrl: null}, LABELS)
        // Initial badge draws a filled circle before the club name text.
        expect(fakeCtx.arc).toHaveBeenCalled()
        expect(fakeCtx.fillText).toHaveBeenCalledWith('K', expect.any(Number), expect.any(Number))
    })

    it('draws the logo image when it loads successfully', async () => {
        class FakeImage {
            crossOrigin = ''
            src = ''
            onload: (() => void) | null = null
            onerror: (() => void) | null = null
            set _src(v: string) { this.src = v }
        }
        const realImage = globalThis.Image
        vi.stubGlobal('Image', class extends FakeImage {
            constructor() {
                super()
                queueMicrotask(() => this.onload?.())
            }
        } as any)

        const blob = await renderRecapCardImage(baseRecap(), THEME, {clubName: 'Kegelclub', logoUrl: 'https://example.test/logo.png'}, LABELS)
        expect(blob).toBeInstanceOf(Blob)
        expect(fakeCtx.drawImage).toHaveBeenCalled()

        vi.stubGlobal('Image', realImage)
    })

    it('falls back to the initial badge when the logo fails to load', async () => {
        vi.stubGlobal('Image', class {
            crossOrigin = ''
            src = ''
            onload: (() => void) | null = null
            onerror: (() => void) | null = null
            constructor() {
                queueMicrotask(() => this.onerror?.())
            }
        } as any)

        const blob = await renderRecapCardImage(baseRecap(), THEME, {clubName: 'Kegelclub', logoUrl: 'https://example.test/broken.png'}, LABELS)
        expect(blob).toBeInstanceOf(Blob)
        expect(fakeCtx.drawImage).not.toHaveBeenCalled()
        expect(fakeCtx.arc).toHaveBeenCalled()
    })

    it('rejects when canvas.toBlob yields null', async () => {
        toBlobResult = null
        await expect(renderRecapCardImage(baseRecap(), THEME, {clubName: 'X', logoUrl: null}, LABELS))
            .rejects.toThrow(/toBlob/)
    })

    it('rejects when no 2D context is available', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
        await expect(renderRecapCardImage(baseRecap(), THEME, {clubName: 'X', logoUrl: null}, LABELS))
            .rejects.toThrow(/context/)
    })
})

// ── shareOrDownloadRecapImage ──

describe('shareOrDownloadRecapImage', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('shares via the Web Share API when file sharing is supported', async () => {
        const share = vi.fn().mockResolvedValue(undefined)
        const canShare = vi.fn().mockReturnValue(true)
        vi.stubGlobal('navigator', {...navigator, share, canShare})

        const result = await shareOrDownloadRecapImage(new Blob(['x']), 'evening.png', 'Title', 'Text')

        expect(result).toBe('shared')
        expect(share).toHaveBeenCalledWith(expect.objectContaining({title: 'Title', text: 'Text'}))
    })

    it('falls back to a download when the platform cannot share files', async () => {
        vi.stubGlobal('navigator', {...navigator, share: undefined, canShare: undefined})
        vi.stubGlobal('URL', {...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn()})
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

        const result = await shareOrDownloadRecapImage(new Blob(['x']), 'evening.png', 'Title', 'Text')

        expect(result).toBe('downloaded')
        expect(clickSpy).toHaveBeenCalled()
    })

    it('falls back to a download when canShare rejects the file', async () => {
        const share = vi.fn()
        const canShare = vi.fn().mockReturnValue(false)
        vi.stubGlobal('navigator', {...navigator, share, canShare})
        vi.stubGlobal('URL', {...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn()})
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

        const result = await shareOrDownloadRecapImage(new Blob(['x']), 'evening.png', 'Title', 'Text')

        expect(result).toBe('downloaded')
        expect(share).not.toHaveBeenCalled()
    })
})
