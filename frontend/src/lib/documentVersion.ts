/**
 * Suggests the next version label for a club document: bumps the last number in the previous
 * label ("1.0" → "1.1", "v2" → "v3", "2026-3" → "2026-4"). Returns '' when there is nothing to bump,
 * so the field stays empty for the admin to fill in. The result is only a suggestion.
 */
export function nextVersion(previous: string | null | undefined): string {
    const prev = (previous ?? '').trim()
    const m = /^(.*?)(\d+)(\D*)$/.exec(prev)
    if (!m) return ''
    return `${m[1]}${Number(m[2]) + 1}${m[3]}`
}
