/**
 * WCAG contrast math — the guard rail behind the semantic color tokens (#70).
 *
 * Why this exists: the club theme is user-configurable (primary/secondary/background per club,
 * #31) and multiplied by a personal dark/light preference (#55). That is a two-dimensional space
 * no hand-picked hex value can cover. #49 raised `--muted` to hit ~5.6:1 against the dark
 * background; the light mode added in #55 recomputed muted from a fixed lightness formula and
 * silently landed back at 2.78:1. Tokens are therefore *derived* here and contrast-checked,
 * so an unreadable brand × mode combination cannot be constructed by configuration.
 *
 * Pure functions only — no DOM. `App.tsx` writes the results to CSS custom properties.
 */
import {hexToHsl, hslToHex} from './color'

/** WCAG 2.1 AA for normal-size text. */
export const AA_TEXT = 4.5
/** WCAG 2.1 AA for large text (>=18.66px bold or >=24px) and UI component boundaries. */
export const AA_LARGE = 3

function channels(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    return [
        parseInt(full.slice(0, 2), 16) / 255,
        parseInt(full.slice(2, 4), 16) / 255,
        parseInt(full.slice(4, 6), 16) / 255,
    ]
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = channels(hex).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors — 1 (identical) to 21 (black on white). Order-independent. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a), lb = relativeLuminance(b)
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Picks whichever of `dark`/`light` reads better on `bg` — the color to use for text sitting
 * *on top of* a filled surface (`--on-accent`, `--on-team-N`). Mirrors the backend's
 * `email_theme.on_primary`, but compares real contrast ratios instead of a luminance threshold.
 */
export function readableOn(bg: string, dark = '#141414', light = '#ffffff'): string {
    return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light
}

/**
 * Returns `fg` adjusted just far enough to reach `target` contrast against `bg`, keeping its hue
 * and saturation so club branding survives (an amber club stays amber, it only gets darker on a
 * light background). Already-conforming colors are returned unchanged.
 *
 * `bg` may be a list, in which case the result satisfies `target` against *every* entry. That
 * matters because one token is painted on several surfaces (canvas, card, card-inside-card): fixing
 * it against only the worst one at the time of measurement can flip which surface is worst and
 * leave the other failing.
 *
 * Walks lightness away from the background — down on a light bg, up on a dark one — and takes the
 * first conforming step. If the whole ramp is exhausted (an unreachable target at this hue), the
 * most readable variant found is returned: still the best available, never a silent failure.
 */
export function ensureContrast(fg: string, bg: string | string[], target = AA_TEXT): string {
    const bgs = Array.isArray(bg) ? bg : [bg]
    const worst = (c: string) => Math.min(...bgs.map(b => contrastRatio(c, b)))
    if (worst(fg) >= target) return fg
    const [h, s] = hexToHsl(fg)
    // Dark background(s) -> brighten the foreground; light background(s) -> darken it.
    const avgLum = bgs.reduce((sum, b) => sum + relativeLuminance(b), 0) / bgs.length
    const towardsLight = avgLum < 0.5
    let best = fg
    let bestRatio = worst(fg)
    for (let l = towardsLight ? 0 : 100; towardsLight ? l <= 100 : l >= 0; l += towardsLight ? 1 : -1) {
        const candidate = hslToHex(h, s, l)
        const ratio = worst(candidate)
        if (ratio > bestRatio) {
            best = candidate
            bestRatio = ratio
        }
        if (ratio >= target) return candidate
    }
    return best
}

/**
 * Composites `fg` over `bg` at `pct` opacity in sRGB — the JS twin of a
 * `color-mix(in srgb, <color> 15%, transparent)` layered on the page background.
 *
 * Needed because the tinted badge/team backgrounds are translucent: their effective background is
 * the *mix*, not the page background, so that mix is what the text on them must be checked against.
 */
export function mixOver(fg: string, bg: string, pct: number): string {
    const f = channels(fg), b = channels(bg)
    const w = Math.max(0, Math.min(1, pct / 100))
    const out = f.map((c, i) => Math.round((c * w + b[i] * (1 - w)) * 255))
    return '#' + out.map(c => c.toString(16).padStart(2, '0')).join('')
}
