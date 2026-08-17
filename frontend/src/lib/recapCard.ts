/**
 * Shareable evening recap card (cherry-on-top feature): a canvas-rendered PNG summarizing a closed
 * evening — König, teuerste Einzelstrafe, durstigster Spieler, Gesamtsumme — meant to be dropped
 * straight into the club's WhatsApp group. Rendered via the Canvas API (same zero-dependency
 * approach as `BowlingGame.tsx`'s 2.5D rendering) rather than a DOM-to-image library, so nothing new
 * has to be installed and the output is a real raster image the Web Share API can attach as a file.
 *
 * Split in two: `computeEveningRecap` is a pure derivation over an `Evening` (easily unit-tested),
 * `renderRecapCardImage` is the drawing step (async — it may load the club logo).
 */
import type {Evening, EveningPlayer} from '@/types'
import {penaltyEuro} from '@/lib/liveEvening'

function displayName(p: EveningPlayer): string {
    return p.nickname || p.name
}

export interface RecapTopPenalty {
    playerName: string
    icon: string
    typeName: string
    amount: number
}

export interface RecapTopDrinker {
    name: string
    count: number
}

export interface EveningRecap {
    date: string
    venue: string | null
    playerCount: number
    kingName: string | null
    topPenalty: RecapTopPenalty | null
    topDrinker: RecapTopDrinker | null
    totalPenaltyEuro: number
    beerRounds: number
    shotRounds: number
    gamesFinished: number
}

/** Pure: derives the recap headline stats from a closed (or any) evening's full detail payload. */
export function computeEveningRecap(evening: Evening | null | undefined): EveningRecap | null {
    if (!evening) return null
    const byId = new Map(evening.players.map(p => [p.id, p]))

    const king = evening.players.find(p => p.is_king) ?? null

    // Absence entries (`player_id === null`, logged for members who missed the evening entirely)
    // aren't a fun "highlight" to headline — the whole point of a shareable recap is what actually
    // happened at the table, and someone who wasn't there didn't have a dramatic moment. Excluding
    // them also keeps `totalPenaltyEuro` (below) as the one place they still count, which is correct
    // since they *do* belong in the evening's pot.
    let topPenalty: RecapTopPenalty | null = null
    for (const p of evening.penalty_log) {
        if (p.player_id == null) continue
        const amount = penaltyEuro(p.unit_amount, p.amount)
        if (!topPenalty || amount > topPenalty.amount) {
            topPenalty = {playerName: p.player_name, icon: p.icon || '⚠️', typeName: p.penalty_type_name, amount}
        }
    }

    const drinkCounts = new Map<number, number>()
    for (const d of evening.drink_rounds) {
        for (const pid of d.participant_ids) {
            drinkCounts.set(pid, (drinkCounts.get(pid) ?? 0) + 1)
        }
    }
    let topDrinker: RecapTopDrinker | null = null
    for (const [pid, count] of drinkCounts) {
        const player = byId.get(pid)
        if (!player) continue
        if (!topDrinker || count > topDrinker.count) {
            topDrinker = {name: displayName(player), count}
        }
    }

    return {
        date: evening.date,
        venue: evening.venue,
        playerCount: evening.players.length,
        kingName: king ? displayName(king) : null,
        topPenalty,
        topDrinker,
        totalPenaltyEuro: evening.penalty_log.reduce((s, p) => s + penaltyEuro(p.unit_amount, p.amount), 0),
        beerRounds: evening.drink_rounds.filter(d => d.drink_type === 'beer').length,
        shotRounds: evening.drink_rounds.filter(d => d.drink_type === 'shots').length,
        gamesFinished: evening.games.filter(g => g.status === 'finished').length,
    }
}

export interface RecapTheme {
    canvas: string
    ink: string
    muted: string
    accent: string
    onAccent: string
    line: string
}

export interface RecapBranding {
    clubName: string
    logoUrl: string | null
}

/** Every label is pre-translated by the caller — this module has no access to `useT()`. */
export interface RecapLabels {
    title: string
    dateLine: string
    king: string
    topPenalty: string
    topDrinker: string
    total: string
    games: string
    footer: string
}

function formatEuro(v: number): string {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('recap card: logo image failed to load'))
        img.src = url
    })
}

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

interface StatRow {
    icon: string
    label: string
    value: string
    sub?: string
}

/**
 * Draws the recap card to an offscreen canvas and resolves a PNG blob. Falls back to a plain
 * initial badge when the club has no logo or the logo fails to load (self-hosted upload that 404s,
 * offline, etc.) — a broken image must never abort the whole card.
 */
export async function renderRecapCardImage(recap: EveningRecap, theme: RecapTheme, branding: RecapBranding, labels: RecapLabels): Promise<Blob> {
    const canvas = document.createElement('canvas')
    canvas.width = CARD_WIDTH
    canvas.height = CARD_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('recap card: 2D canvas context unavailable')

    ctx.fillStyle = theme.canvas
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

    // ── Header band ──
    ctx.fillStyle = theme.accent
    ctx.fillRect(0, 0, CARD_WIDTH, 220)

    const logoX = 60, logoY = 60, logoSize = 100
    let logoDrawn = false
    if (branding.logoUrl) {
        try {
            const img = await loadImage(branding.logoUrl)
            ctx.save()
            ctx.beginPath()
            ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
            ctx.closePath()
            ctx.clip()
            ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
            ctx.restore()
            logoDrawn = true
        } catch {
            // fall through to the initial badge below
        }
    }
    if (!logoDrawn) {
        ctx.fillStyle = theme.onAccent
        ctx.beginPath()
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = theme.accent
        ctx.font = 'bold 48px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((branding.clubName || '?').charAt(0).toUpperCase(), logoX + logoSize / 2, logoY + logoSize / 2 + 4)
    }

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = theme.onAccent
    ctx.font = 'bold 40px sans-serif'
    ctx.fillText(branding.clubName, logoX + logoSize + 30, logoY + 45)
    ctx.font = '28px sans-serif'
    ctx.fillText(labels.title, logoX + logoSize + 30, logoY + 85)

    // ── Date / venue line ──
    ctx.fillStyle = theme.ink
    ctx.font = '32px sans-serif'
    ctx.fillText(labels.dateLine, 60, 300)

    // ── Stat rows ──
    const rows: StatRow[] = []
    if (recap.kingName) rows.push({icon: '👑', label: labels.king, value: recap.kingName})
    if (recap.topPenalty) {
        rows.push({
            icon: recap.topPenalty.icon || '💸', label: labels.topPenalty,
            value: formatEuro(recap.topPenalty.amount),
            sub: `${recap.topPenalty.playerName} — ${recap.topPenalty.typeName}`,
        })
    }
    if (recap.topDrinker) {
        rows.push({icon: '🍻', label: labels.topDrinker, value: String(recap.topDrinker.count), sub: recap.topDrinker.name})
    }
    rows.push({icon: '💰', label: labels.total, value: formatEuro(recap.totalPenaltyEuro)})
    rows.push({icon: '🎮', label: labels.games, value: String(recap.gamesFinished)})

    let y = 380
    for (const row of rows) {
        ctx.font = '52px sans-serif'
        ctx.fillStyle = theme.ink
        ctx.fillText(row.icon, 60, y + 20)
        ctx.font = 'bold 34px sans-serif'
        ctx.fillStyle = theme.muted
        ctx.fillText(row.label, 150, y - 6)
        ctx.font = 'bold 46px sans-serif'
        ctx.fillStyle = theme.accent
        ctx.fillText(row.value, 150, y + 42)
        if (row.sub) {
            ctx.font = '26px sans-serif'
            ctx.fillStyle = theme.muted
            ctx.fillText(row.sub, 150, y + 78)
            y += 130
        } else {
            y += 108
        }
        ctx.strokeStyle = theme.line
        ctx.beginPath()
        ctx.moveTo(60, y - 24)
        ctx.lineTo(CARD_WIDTH - 60, y - 24)
        ctx.stroke()
        y += 16
    }

    ctx.font = '24px sans-serif'
    ctx.fillStyle = theme.muted
    ctx.textAlign = 'center'
    ctx.fillText(labels.footer, CARD_WIDTH / 2, CARD_HEIGHT - 40)

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob)
            else reject(new Error('recap card: canvas.toBlob returned null'))
        }, 'image/png')
    })
}

export type RecapShareResult = 'shared' | 'downloaded'

/**
 * Shares the rendered image via the Web Share API when the platform supports sharing files
 * (mobile — this is the "drop it straight into WhatsApp" path); falls back to a plain browser
 * download everywhere else (desktop, or a browser without file-sharing support).
 */
export async function shareOrDownloadRecapImage(blob: Blob, filename: string, title: string, text: string): Promise<RecapShareResult> {
    const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean
        share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>
    }
    const file = new File([blob], filename, {type: 'image/png'})

    if (nav.share && nav.canShare?.({files: [file]})) {
        await nav.share({files: [file], title, text})
        return 'shared'
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    return 'downloaded'
}
