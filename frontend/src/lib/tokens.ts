/**
 * Semantic design tokens (#70).
 *
 * Every color the UI paints with is derived here from three inputs — the club's primary and
 * secondary brand colors plus the effective background (which already encodes the personal
 * dark/light preference, #55) — and every foreground is contrast-checked against the surface it
 * actually sits on. Configuration therefore cannot produce an unreadable combination.
 *
 * Token vocabulary (semantic pairs, per #70):
 *   canvas / surface / surface-2 / line   the neutral ramp, derived from the background
 *   ink                                   primary text on canvas and surface
 *   muted                                 secondary text — AA-checked against the *worse* of the two
 *   accent / accent-fg / on-accent        brand color: raw fill · readable as text · text on the fill
 *   accent-2 / accent-2-fg / on-accent-2  same for the secondary brand color
 *   danger|positive (+ -fg, on-)          status colors, same three roles
 *   team-N / team-N-fg / team-N-tint      the six team hues; `-tint` is the composited badge bg
 *
 * The `-fg` suffix always means "this color, adjusted until it is readable *as text* on the page";
 * `on-` always means "the text color to put *on top of* that fill". Anything painted as a stroke or
 * label in a chart wants `-fg` — a raw brand amber is invisible on a light background.
 *
 * Pure: returns a flat map of CSS custom property names to hex values. The DOM write lives in
 * App.tsx, which keeps this file unit-testable.
 */
import {hexToHsl, hslToHex} from './color'
import {AA_LARGE, AA_TEXT, ensureContrast, mixOver, readableOn} from './contrast'

/** Opacity of the translucent tint behind team/role badges — mirrors the CSS `color-mix` percentage. */
export const TINT_PCT = 15

/** Fixed team hues. Not club-configurable (teams must stay distinguishable from each other),
 *  but their *text* variants are still derived per theme so they survive light mode. */
export const TEAM_BASE = ['#e8a020', '#5cb87a', '#5090d8', '#d95050', '#a06bcc', '#ff9632'] as const

export const DEFAULT_PRIMARY = '#e8a020'
export const DEFAULT_SECONDARY = '#6b7c5a'
export const DEFAULT_DARK_BG = '#1a1410'

/** Status hues — semantic, deliberately not part of club branding. */
const DANGER_BASE = '#d95050'
const POSITIVE_BASE = '#5cb87a'

/** Medal tiers (achievement badges #52, year podium #7). Gold is the club accent by design;
 *  bronze and silver are fixed hues that still need a readable twin per theme — silver as text
 *  is ~1.4:1 on a light background. */
const TIER_BASE: Record<string, string> = {'tier-bronze': '#cd7f32', 'tier-silver': '#c0c0c0'}

export interface TokenInput {
    primary?: string | null
    secondary?: string | null
    bg?: string | null
}

/**
 * Derives the full token set.
 *
 * The neutral ramp keeps the previous behaviour (surfaces step away from the background, text steps
 * towards full contrast) because that part was already correct in both modes. What is new is that
 * every *chromatic* token gets an AA-checked `-fg` twin and an `on-` counterpart, and that `muted`
 * is verified rather than assumed.
 */
export function deriveTokens(input: TokenInput = {}): Record<string, string> {
    const primary = input.primary || DEFAULT_PRIMARY
    const secondary = input.secondary || DEFAULT_SECONDARY
    const canvas = input.bg || DEFAULT_DARK_BG

    const [h, s, l] = hexToHsl(canvas)
    const dark = l < 50
    const step = dark ? 1 : -1

    const surface = hslToHex(h, s, l + step * 4)
    const surface2 = hslToHex(h, s, l + step * 8)
    const line = hslToHex(h, s, l + step * 16)
    const ink = hslToHex(h, Math.min(s * 0.6, 40), dark ? 90 : 10)

    // Muted text appears on canvas, surface *and* surface-2 (cards inside cards), so it is checked
    // against all three at once — the seed formula alone is what regressed between #49 and #55.
    const textSurfaces = [canvas, surface, surface2]
    const muted = ensureContrast(hslToHex(h, Math.min(s * 0.3, 20), dark ? 45 : 55), textSurfaces, AA_TEXT)

    const tokens: Record<string, string> = {
        '--canvas': canvas,
        '--surface': surface,
        '--surface-2': surface2,
        '--line': line,
        '--ink': ink,
        '--on-surface': ink,
        '--muted': muted,
        // The guest avatar is a filled muted disc with its initial on top (Avatar variant="muted").
        '--on-muted': readableOn(muted),
    }

    // Chromatic families. `-fg` is checked against every neutral surface it can land on, so a
    // section heading stays readable whether it sits on the page or inside a nested card.
    const family = (name: string, base: string) => {
        tokens[`--${name}`] = base
        tokens[`--${name}-fg`] = ensureContrast(base, textSurfaces, AA_TEXT)
        tokens[`--on-${name}`] = readableOn(base)
        // Translucent badge/pill background, plus the text color for that composited tint.
        const tint = mixOver(base, canvas, TINT_PCT)
        tokens[`--${name}-tint`] = tint
        tokens[`--${name}-tint-fg`] = ensureContrast(base, tint, AA_TEXT)
    }

    family('accent', primary)
    family('accent-2', secondary)
    family('danger', DANGER_BASE)
    family('positive', POSITIVE_BASE)
    TEAM_BASE.forEach((base, i) => family(`team-${i}`, base))
    Object.entries(TIER_BASE).forEach(([name, base]) => family(name, base))

    // A deepened accent for gradients and the offline banner — previously the hardcoded #c4701a.
    // Two constraints, applied in order: the fill has to be distinguishable from the page (AA_LARGE
    // is enough for a block of color), and the text on it has to reach full AA. The offline banner
    // sets 12px bold, which is *not* WCAG "large text" (that starts at 18.66px bold), so the pair
    // cannot settle for 3:1 — an earlier version did and landed at 4.36:1 in light mode.
    const [ah, as] = hexToHsl(primary)
    const deepSeed = ensureContrast(hslToHex(ah, Math.min(as + 10, 100), dark ? 42 : 34), canvas, AA_LARGE)
    const onDeep = readableOn(deepSeed)
    tokens['--accent-deep'] = ensureContrast(deepSeed, onDeep, AA_TEXT)
    tokens['--on-accent-deep'] = onDeep

    // The darker stop of the avatar gradient. It has to stay shallow enough that `--on-accent` — the
    // initial painted across the whole gradient — is readable on it too; `--accent-deep` is not, it
    // pairs with its own white/black. (The old hardcoded #c4701a start had the same 3.9:1 problem.)
    tokens['--accent-shade'] = ensureContrast(mixOver('#000000', primary, 18), tokens['--on-accent'], AA_TEXT)

    return tokens
}

/**
 * Every (foreground, background, minimum) triple the derived tokens promise to satisfy.
 * Consumed by the regression test that asserts AA in dark *and* light mode — the check that
 * would have caught the #49 -> #55 muted regression.
 */
export function contrastContract(tokens: Record<string, string>): Array<[string, string, number]> {
    const pairs: Array<[string, string, number]> = [
        ['--ink', '--canvas', AA_TEXT],
        ['--ink', '--surface', AA_TEXT],
        ['--muted', '--canvas', AA_TEXT],
        ['--muted', '--surface', AA_TEXT],
        ['--muted', '--surface-2', AA_TEXT],
        ['--on-muted', '--muted', AA_TEXT],
        ['--line', '--canvas', 1.2], // a divider only has to be perceptible, not readable
    ]
    const families = ['accent', 'accent-2', 'danger', 'positive',
        ...TEAM_BASE.map((_, i) => `team-${i}`), ...Object.keys(TIER_BASE)]
    for (const f of families) {
        pairs.push([`--${f}-fg`, '--canvas', AA_TEXT])
        pairs.push([`--${f}-fg`, '--surface', AA_TEXT])
        pairs.push([`--on-${f}`, `--${f}`, AA_TEXT])
        pairs.push([`--${f}-tint-fg`, `--${f}-tint`, AA_TEXT])
    }
    pairs.push(['--on-accent-deep', '--accent-deep', AA_TEXT])
    pairs.push(['--on-accent', '--accent-shade', AA_TEXT])
    pairs.push(['--accent-deep', '--canvas', AA_LARGE])
    return pairs.filter(([fg, bg]) => tokens[fg] && tokens[bg])
}
