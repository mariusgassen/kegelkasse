/**
 * Tailwind palette colours (`text-red-400`, `bg-amber-500/10` …) are fixed hues: the theme is
 * club-configurable x dark/light, so a fixed value is unreadable in some valid configuration.
 * Chrome must use the semantic tokens (see CLAUDE.md). Kiosk/artwork files and documented
 * exceptions are listed below; adding one is allowed, but should be a deliberate decision.
 */
import {describe, it, expect} from 'vitest'
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {resolve, relative} from 'node:path'

const SRC = resolve(import.meta.dirname, '..')

const EXEMPT: Record<string, string> = {
    'components/BowlingGame.tsx': 'artwork / dark-only kiosk',
    'pages/CameraCapturePage.tsx': 'dark-only kiosk',
    'pages/TabletQuickEntryPage.tsx': 'dark-only kiosk',
    'pages/ScoreboardPage.tsx': 'dark-only kiosk',
    'components/superadmin/SuperadminRolesManager.tsx': 'role badges need distinct fixed hues',
    'pages/BookPage.tsx': 'developer docs showing the literals',
}

const PALETTE = /\b(?:text|bg|border|ring|from|to|via)-(?:red|green|blue|yellow|amber|orange|gray|slate|zinc|neutral|emerald|lime|teal|cyan|sky|indigo|violet|purple|pink|rose)-\d{2,3}\b/g

function walk(dir: string, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const p = resolve(dir, e)
        if (statSync(p).isDirectory()) {
            if (e !== '__tests__') walk(p, out)
        } else if (p.endsWith('.tsx')) out.push(p)
    }
    return out
}

describe('colour literals', () => {
    it('uses no Tailwind palette colours outside the exempt list', () => {
        const hits: string[] = []
        for (const f of walk(SRC)) {
            const rel = relative(SRC, f)
            if (rel in EXEMPT) continue
            const m = readFileSync(f, 'utf8').match(PALETTE)
            if (m) hits.push(`${rel}: ${[...new Set(m)].join(', ')}`)
        }
        expect(hits).toEqual([])
    })
})
