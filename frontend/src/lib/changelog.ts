/**
 * Release notes ("What's new"), derived from release-please's CHANGELOG.md.
 *
 * CHANGELOG.md lives at the repo root and is not part of the frontend's Docker build
 * context, so `scripts/release-notes.mjs` turns it into `src/whatsNew/releases.json` on
 * the release PR (adding German translations). This module holds the pure parts: the
 * Markdown parser, merging previously translated text, and the view helpers. It must
 * stay free of non-erasable TypeScript (enums, namespaces, parameter properties) and of
 * imports, because the script loads it with Node's built-in type stripping.
 */

export type ReleaseLang = 'en' | 'de'

export interface ReleaseItem {
    /** Stable identity across regenerations: the commit sha, else the English text. */
    key: string
    scope?: string
    pr?: number
    sha?: string
    text: { en: string; de?: string }
}

export interface ReleaseSection {
    /** `feat` | `fix` | `perf` | `deps` | `revert` | `breaking` | slug of an unknown heading */
    type: string
    items: ReleaseItem[]
}

export interface Release {
    version: string
    date?: string
    sections: ReleaseSection[]
}

export interface ReleaseNotes {
    releases: Release[]
}

const SECTION_TYPES: Record<string, string> = {
    'features': 'feat',
    'bug fixes': 'fix',
    'performance': 'perf',
    'performance improvements': 'perf',
    'dependencies': 'deps',
    'reverts': 'revert',
    'breaking changes': 'breaking',
}

/** Sections a club member sees, in display order. Dependencies/reverts stay in CHANGELOG.md only. */
export const VISIBLE_SECTIONS = ['breaking', 'feat', 'fix', 'perf'] as const

function sectionType(heading: string): string {
    const clean = heading.replace(/[⚠️]/gu, '').trim().toLowerCase()
    return SECTION_TYPES[clean] ?? clean.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** `* **scope:** text ([#12](…)) ([abc1234](…))` → item. */
export function parseItem(line: string, version: string): ReleaseItem | null {
    let rest = line.replace(/^\s*[*-]\s+/, '').trim()
    if (!rest) return null
    let sha: string | undefined
    let pr: number | undefined
    // Trailing link groups, in any order: ([abc1234](url)) and ([#12](url))
    for (;;) {
        const m = rest.match(/\s*\(\[(#?)([0-9a-f]{7,40}|\d+)\]\([^)]*\)\)\s*$/i)
        if (!m) break
        if (m[1] === '#') pr = Number(m[2])
        else sha = m[2].slice(0, 7)
        rest = rest.slice(0, m.index).trim()
    }
    // "closes #12" style trailers release-please appends
    rest = rest.replace(/,?\s*closes\s+\[#\d+\]\([^)]*\)/gi, '').trim()
    let scope: string | undefined
    const s = rest.match(/^\*\*([^*]+?):\*\*\s*/)
    if (s) {
        scope = s[1].trim()
        rest = rest.slice(s[0].length)
    }
    // Inline Markdown → plain text
    const text = rest
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim()
    if (!text) return null
    return {key: sha ?? `${version}:${text}`, scope, pr, sha, text: {en: text}}
}

/** Parse release-please's CHANGELOG.md into releases, newest first (file order). */
export function parseChangelog(md: string): Release[] {
    const releases: Release[] = []
    let release: Release | null = null
    let section: ReleaseSection | null = null
    for (const line of md.split(/\r?\n/)) {
        const v = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)\]?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?/)
        if (v && !line.startsWith('###')) {
            release = {version: v[1], date: v[2], sections: []}
            releases.push(release)
            section = null
            continue
        }
        if (!release) continue
        const h = line.match(/^###\s+(.+?)\s*$/)
        if (h) {
            const type = sectionType(h[1])
            section = release.sections.find(x => x.type === type) ?? null
            if (!section) {
                section = {type, items: []}
                release.sections.push(section)
            }
            continue
        }
        // Top-level bullets only; indented lines are continuation detail.
        if (section && /^[*-]\s+/.test(line)) {
            const item = parseItem(line, release.version)
            if (item) section.items.push(item)
        }
    }
    return releases.filter(r => r.sections.some(s => s.items.length > 0))
}

/** Carry translations over from a previous `releases.json` (matched by version + key). */
export function mergeTranslations(fresh: Release[], previous: Release[]): Release[] {
    const known = new Map<string, ReleaseItem['text']>()
    for (const r of previous)
        for (const s of r.sections)
            for (const i of s.items) known.set(`${r.version}|${i.key}`, i.text)
    return fresh.map(r => ({
        ...r,
        sections: r.sections.map(s => ({
            ...s,
            items: s.items.map(i => {
                const old = known.get(`${r.version}|${i.key}`)
                // Keep a translation only while its English source is unchanged.
                return old && old.en === i.text.en ? {...i, text: {...old, ...i.text, de: old.de}} : i
            }),
        })),
    }))
}

export interface MissingTranslation {
    id: string
    en: string
}

export function itemId(release: Release, item: ReleaseItem): string {
    return `${release.version}|${item.key}`
}

/** Visible items that still lack a `lang` translation. */
export function missingTranslations(releases: Release[], lang: Exclude<ReleaseLang, 'en'>): MissingTranslation[] {
    const out: MissingTranslation[] = []
    for (const r of releases)
        for (const s of r.sections)
            if ((VISIBLE_SECTIONS as readonly string[]).includes(s.type))
                for (const i of s.items) if (!i.text[lang]) out.push({id: itemId(r, i), en: i.text.en})
    return out
}

export function applyTranslations(releases: Release[], lang: Exclude<ReleaseLang, 'en'>, byId: Record<string, string>): Release[] {
    return releases.map(r => ({
        ...r,
        sections: r.sections.map(s => ({
            ...s,
            items: s.items.map(i => {
                const tr = byId[itemId(r, i)]?.trim()
                return tr ? {...i, text: {...i.text, [lang]: tr}} : i
            }),
        })),
    }))
}

// ── View helpers ────────────────────────────────────────────────────────────

export function itemText(item: ReleaseItem, lang: ReleaseLang): string {
    return item.text[lang] || item.text.en
}

/** Releases with only the sections members see, in display order; empty releases dropped. */
export function visibleReleases(releases: Release[]): Release[] {
    return releases
        .map(r => ({
            ...r,
            sections: VISIBLE_SECTIONS
                .map(type => r.sections.find(s => s.type === type))
                .filter((s): s is ReleaseSection => !!s && s.items.length > 0),
        }))
        .filter(r => r.sections.length > 0)
}

/** Semver-ish comparison of `X.Y.Z` (pre-release suffixes ignored). */
export function compareVersions(a: string, b: string): number {
    const pa = a.split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0)
    const pb = b.split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0)
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
    return 0
}

/** Newest visible version, or null. */
export function latestVersion(releases: Release[]): string | null {
    const visible = visibleReleases(releases)
    if (!visible.length) return null
    const sorted = visible.map(r => r.version).sort(compareVersions)
    return sorted[sorted.length - 1] ?? null
}

/** True when there is a visible release newer than the one the member last opened. */
export function hasUnseen(releases: Release[], lastSeen: string | null): boolean {
    const latest = latestVersion(releases)
    if (!latest) return false
    return !lastSeen || compareVersions(latest, lastSeen) > 0
}
