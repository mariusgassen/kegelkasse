import {describe, it, expect} from 'vitest'
import {
    parseChangelog, parseItem, mergeTranslations, missingTranslations, applyTranslations,
    visibleReleases, latestVersion, hasUnseen, compareVersions, itemText, type Release,
} from '../changelog'

const MD = `# Changelog

## [1.70.0](https://github.com/x/compare/v1.69.0...v1.70.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* drop legacy hash links ([#520](https://github.com/x/pull/520))

### Features

* **ai:** per-club AI settings ([#511](https://github.com/x/pull/511)) ([abc1234](https://github.com/x/commit/abc1234def))
* plain feature ([0f0f0f0](https://github.com/x/commit/0f0f0f0aa))

### Bug Fixes

* **treasury:** \`fe()\` rounding ([#512](https://github.com/x/pull/512)) ([1234567](https://github.com/x/commit/1234567))

### Dependencies

* bump vite ([7654321](https://github.com/x/commit/7654321))

## 1.69.1 (2026-11-05)

### Bug Fixes

* older fix ([aaaaaaa](https://github.com/x/commit/aaaaaaa))
`

describe('parseItem', () => {
    it('extracts scope, PR and sha', () => {
        const i = parseItem('* **ai:** per-club AI settings ([#511](u)) ([abc1234def](u))', '1.0.0')!
        expect(i).toMatchObject({scope: 'ai', pr: 511, sha: 'abc1234', key: 'abc1234', text: {en: 'per-club AI settings'}})
    })
    it('falls back to a version-scoped key without a sha', () => {
        expect(parseItem('* thing', '1.2.0')!.key).toBe('1.2.0:thing')
    })
    it('strips inline markdown and ignores empty lines', () => {
        expect(parseItem('* use `fe()` and [docs](http://x)', '1.0.0')!.text.en).toBe('use fe() and docs')
        expect(parseItem('*   ', '1.0.0')).toBeNull()
    })
})

describe('parseChangelog', () => {
    const rel = parseChangelog(MD)
    it('parses releases newest first, with and without link/brackets', () => {
        expect(rel.map(r => r.version)).toEqual(['1.70.0', '1.69.1'])
        expect(rel[0].date).toBe('2026-11-06')
    })
    it('maps headings to section types', () => {
        expect(rel[0].sections.map(s => s.type)).toEqual(['breaking', 'feat', 'fix', 'deps'])
        expect(rel[0].sections[1].items).toHaveLength(2)
    })
    it('skips releases without entries', () => {
        expect(parseChangelog('## 1.0.0 (2026-01-01)\n\n### Features\n')).toEqual([])
    })
    it('returns [] for an empty file', () => expect(parseChangelog('')).toEqual([]))
})

describe('translations', () => {
    const fresh = parseChangelog(MD)
    it('lists only visible sections as missing (no deps)', () => {
        const m = missingTranslations(fresh, 'de')
        expect(m).toHaveLength(5)
        expect(m.some(x => x.en === 'bump vite')).toBe(false)
    })
    it('applies translations by id and then reports none missing', () => {
        const ids = Object.fromEntries(missingTranslations(fresh, 'de').map(m => [m.id, `DE ${m.en}`]))
        const out = applyTranslations(fresh, 'de', ids)
        expect(missingTranslations(out, 'de')).toEqual([])
        expect(itemText(out[0].sections[1].items[0], 'de')).toBe('DE per-club AI settings')
    })
    it('keeps old translations on regeneration, drops them when English changed', () => {
        const prev = applyTranslations(fresh, 'de', Object.fromEntries(missingTranslations(fresh, 'de').map(m => [m.id, `DE ${m.en}`])))
        const changed = parseChangelog(MD.replace('plain feature', 'reworded feature'))
        const merged = mergeTranslations(changed, prev)
        const feats = merged[0].sections.find(s => s.type === 'feat')!.items
        expect(feats[0].text.de).toBe('DE per-club AI settings')
        expect(feats[1].text.de).toBeUndefined()
    })
    it('falls back to English when German is missing', () => {
        expect(itemText({key: 'k', text: {en: 'x'}}, 'de')).toBe('x')
    })
})

describe('view helpers', () => {
    const rel = parseChangelog(MD)
    it('visibleReleases drops deps and orders sections', () => {
        expect(visibleReleases(rel)[0].sections.map(s => s.type)).toEqual(['breaking', 'feat', 'fix'])
    })
    it('drops a release that only has hidden sections', () => {
        const only: Release[] = [{version: '1.0.0', sections: [{type: 'deps', items: [{key: 'a', text: {en: 'a'}}]}]}]
        expect(visibleReleases(only)).toEqual([])
        expect(latestVersion(only)).toBeNull()
    })
    it('compares versions numerically', () => {
        expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
        expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
    })
    it('hasUnseen', () => {
        expect(hasUnseen(rel, null)).toBe(true)
        expect(hasUnseen(rel, '1.69.1')).toBe(true)
        expect(hasUnseen(rel, '1.70.0')).toBe(false)
        expect(hasUnseen([], null)).toBe(false)
    })
})
