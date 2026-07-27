/**
 * Axis-label geometry for the hand-rolled SVG charts.
 *
 * SVG text has no layout: a `<text textAnchor="end">` parked at a fixed left padding simply
 * draws past the viewBox when the number is longer than that padding guessed, and lands on
 * top of whatever else lives in the gutter (a rotated axis title, the previous chart). Both
 * happen with real data — a four-figure euro amount is roughly twice as wide as the 38-unit
 * gutter these charts were built with.
 *
 * So the gutter is measured from the labels instead of guessed, and the labels themselves are
 * shortened to what an axis actually needs to convey (`1,2k`, not `1.234,56`).
 */

// Per-character advance as a fraction of the font size. There is no text metrics API inside an
// SVG viewBox, so this approximates the app's sans stack: digits and letters sit near 0.6 em,
// separators are much narrower. Deliberately a slight over-estimate — a gutter a few units too
// wide reads fine, one a few units too narrow clips.
const WIDE_CHAR = 0.6
const NARROW_CHARS = new Set([',', '.', ':', ';', ' ', "'", '|', 'i', 'l'])
const NARROW_CHAR = 0.3
const SIGN_CHARS = new Set(['-', '−', '+'])
const SIGN_CHAR = 0.38

/** Approximate rendered width of `text`, in the same units as the chart's viewBox. */
export function estimateTextWidth(text: string, fontSize: number): number {
    let em = 0
    for (const ch of text) {
        if (NARROW_CHARS.has(ch)) em += NARROW_CHAR
        else if (SIGN_CHARS.has(ch)) em += SIGN_CHAR
        else em += WIDE_CHAR
    }
    return em * fontSize
}

/**
 * Left padding wide enough for the widest y-axis label.
 *
 * `gap` is the breathing room between label and axis line, `reserve` space to keep free further
 * left (a rotated axis title), and `min` a floor so an axis with tiny labels keeps its usual
 * proportions.
 */
export function axisLeftPad(labels: string[], fontSize: number, opts: {
    gap?: number
    min?: number
    reserve?: number
} = {}): number {
    const {gap = 5, min = 0, reserve = 0} = opts
    let widest = 0
    for (const label of labels) widest = Math.max(widest, estimateTextWidth(label, fontSize))
    return Math.max(min, Math.ceil(reserve + widest + gap))
}

function scaled(v: number, locale: string): string {
    return Math.abs(v) < 10
        ? v.toLocaleString(locale, {maximumFractionDigits: 1})
        : Math.round(v).toLocaleString(locale)
}

/**
 * A number shortened to axis-tick length: thousands become `1,2k`, millions `1,2M`, and the
 * fraction digits shrink as the magnitude grows. An axis answers "how big", not "how exact" —
 * the precise figure is one tap away in every chart that has these ticks.
 */
export function compactNumber(v: number, locale = 'de-DE'): string {
    const abs = Math.abs(v)
    if (abs >= 1_000_000) return `${scaled(v / 1_000_000, locale)}M`
    if (abs >= 1_000) return `${scaled(v / 1_000, locale)}k`
    if (abs >= 100 || Number.isInteger(v)) return Math.round(v).toLocaleString(locale)
    if (abs >= 10) return v.toLocaleString(locale, {maximumFractionDigits: 1})
    return v.toLocaleString(locale, {maximumFractionDigits: 2})
}

/** {@link compactNumber} with a euro sign in front, for money axes. */
export function compactEuro(v: number, locale = 'de-DE'): string {
    return `€${compactNumber(v, locale)}`
}
