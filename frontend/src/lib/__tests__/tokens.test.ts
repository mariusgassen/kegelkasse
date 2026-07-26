/// <reference types="node" />
import {describe, expect, it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {contrastContract, deriveTokens, DEFAULT_DARK_BG, TEAM_BASE, TINT_PCT} from '../tokens'
import {contrastRatio, mixOver} from '../contrast'
import {hexToHsl} from '../color'

/** The light background the default dark theme mirrors to in light mode (App.resolveThemedBg). */
const LIGHT_BG = '#efe9e5'

/** A spread of club brand configurations, including deliberately hostile ones. */
const CLUBS: Array<[string, {primary: string; secondary: string}]> = [
    ['default amber', {primary: '#e8a020', secondary: '#6b7c5a'}],
    ['near-white brand', {primary: '#fdfbf7', secondary: '#f0eee9'}],
    ['near-black brand', {primary: '#0b0b0d', secondary: '#141018'}],
    ['saturated yellow', {primary: '#ffee00', secondary: '#ccff00'}],
    ['deep blue', {primary: '#12235e', secondary: '#1b2f6b'}],
    ['hot pink', {primary: '#ff2d95', secondary: '#c81e77'}],
]

describe('deriveTokens', () => {
    it('derives the neutral ramp from the background', () => {
        const t = deriveTokens({bg: DEFAULT_DARK_BG})
        expect(t['--canvas']).toBe(DEFAULT_DARK_BG)
        expect(t['--surface']).toBeTruthy()
        expect(t['--surface-2']).toBeTruthy()
        expect(t['--line']).toBeTruthy()
        expect(t['--ink']).toBeTruthy()
    })

    it('falls back to the defaults when nothing is configured', () => {
        const t = deriveTokens()
        expect(t['--canvas']).toBe(DEFAULT_DARK_BG)
        expect(t['--accent']).toBe('#e8a020')
    })

    it('keeps the raw brand color as the fill token', () => {
        const t = deriveTokens({primary: '#12235e', bg: DEFAULT_DARK_BG})
        expect(t['--accent']).toBe('#12235e')
    })

    it('emits a readable text twin that differs from the raw fill when the fill fails', () => {
        const dark = deriveTokens({primary: '#e8a020', bg: DEFAULT_DARK_BG})
        // Amber already passes on the dark background — no adjustment needed.
        expect(dark['--accent-fg']).toBe('#e8a020')

        const light = deriveTokens({primary: '#e8a020', bg: LIGHT_BG})
        // ...but must be darkened for the light one.
        expect(light['--accent-fg']).not.toBe('#e8a020')
        expect(contrastRatio(light['--accent-fg'], LIGHT_BG)).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps the brand hue when deriving the readable twin', () => {
        const [h] = hexToHsl('#e8a020')
        const [fh] = hexToHsl(deriveTokens({primary: '#e8a020', bg: LIGHT_BG})['--accent-fg'])
        expect(fh).toBeCloseTo(h, 0)
    })

    it('derives a tint plus matching text color for badge backgrounds', () => {
        const t = deriveTokens({primary: '#e8a020', bg: DEFAULT_DARK_BG})
        expect(t['--accent-tint']).toBe(mixOver('#e8a020', DEFAULT_DARK_BG, TINT_PCT))
        expect(contrastRatio(t['--accent-tint-fg'], t['--accent-tint'])).toBeGreaterThanOrEqual(4.5)
    })

    it('emits all six team families', () => {
        const t = deriveTokens({bg: DEFAULT_DARK_BG})
        TEAM_BASE.forEach((base, i) => {
            expect(t[`--team-${i}`]).toBe(base)
            expect(t[`--team-${i}-fg`]).toBeTruthy()
            expect(t[`--on-team-${i}`]).toBeTruthy()
        })
    })

    it('emits status families independent of club branding', () => {
        const a = deriveTokens({primary: '#e8a020', bg: DEFAULT_DARK_BG})
        const b = deriveTokens({primary: '#12235e', bg: DEFAULT_DARK_BG})
        expect(a['--danger']).toBe(b['--danger'])
        expect(a['--positive']).toBe(b['--positive'])
    })

    it('derives the deep accent that replaced the hardcoded #c4701a', () => {
        const t = deriveTokens({primary: '#e8a020', bg: DEFAULT_DARK_BG})
        expect(t['--accent-deep']).toMatch(/^#[0-9a-f]{6}$/)
        expect(contrastRatio(t['--on-accent-deep'], t['--accent-deep'])).toBeGreaterThanOrEqual(3)
    })
})

describe('contrast contract', () => {
    // This is the test that would have caught the #49 -> #55 regression: #49 hand-tuned
    // --muted to 5.6:1 against the dark background, then #55 added a light mode that
    // recomputed it from a fixed formula and silently landed at 2.78:1.
    it.each(CLUBS)('holds for %s in dark and light mode', (_name, club) => {
        for (const bg of [DEFAULT_DARK_BG, LIGHT_BG, '#000000', '#ffffff']) {
            const tokens = deriveTokens({...club, bg})
            for (const [fg, bgToken, min] of contrastContract(tokens)) {
                const ratio = contrastRatio(tokens[fg], tokens[bgToken])
                expect(
                    ratio,
                    `${fg} on ${bgToken} (bg ${bg}): ${ratio.toFixed(2)}:1 < ${min}:1`,
                ).toBeGreaterThanOrEqual(min)
            }
        }
    })

    // The :root block in index.css is the pre-JS paint. If it drifts from the derivation, the first
    // frame is painted with stale colors and (worse) hand-edits there look authoritative — which is
    // how the muted value in #49 ended up contradicting the formula that actually produced it.
    it('matches the :root defaults declared in index.css', () => {
        // Read as a file rather than importing it: the Tailwind Vite plugin owns .css transforms and
        // hands back an empty module for `?raw` in the test pipeline.
        const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
        const block = css.match(/^:root \{([\s\S]*?)^}/m)
        expect(block, ':root block not found in index.css').toBeTruthy()
        const declared = Object.fromEntries(
            [...block![1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]),
        )
        expect(declared).toEqual(deriveTokens())
    })

    it('covers every chromatic family it emits', () => {
        const tokens = deriveTokens({bg: DEFAULT_DARK_BG})
        const contract = contrastContract(tokens)
        for (const family of ['accent', 'accent-2', 'danger', 'positive', 'team-0', 'team-5']) {
            expect(contract.some(([fg]) => fg === `--${family}-fg`)).toBe(true)
            expect(contract.some(([fg]) => fg === `--on-${family}`)).toBe(true)
        }
    })
})
