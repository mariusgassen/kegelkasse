import { describe, it, expect } from 'vitest'
import { de } from '../de'
import { en } from '../en'

describe('i18n key completeness', () => {
    const deKeys = Object.keys(de)
    const enKeys = Object.keys(en)

    it('de.ts and en.ts have the same number of keys', () => {
        expect(deKeys.length).toBe(enKeys.length)
    })

    it('every key in de.ts exists in en.ts', () => {
        const missing = deKeys.filter(k => !(k in en))
        expect(missing).toEqual([])
    })

    it('every key in en.ts exists in de.ts', () => {
        const missing = enKeys.filter(k => !(k in de))
        expect(missing).toEqual([])
    })

    it('all translation values are non-empty strings', () => {
        // Cast to Record<string, string> to avoid literal-type narrowing issues
        const deMap = de as Record<string, string>
        const enMap = en as Record<string, string>
        const emptyDe = deKeys.filter(k => typeof deMap[k] !== 'string' || deMap[k] === '')
        const emptyEn = enKeys.filter(k => typeof enMap[k] !== 'string' || enMap[k] === '')
        expect(emptyDe).toEqual([])
        expect(emptyEn).toEqual([])
    })

    it('no translation value has a leading or trailing UI icon/emoji', () => {
        // Prose note prefixes that intentionally start with an arrow.
        const allowed = new Set(['game.loserNote', 'game.perPointNote'])
        const edgeIcon = /^([\u2190-\u2bff\u2600-\u27bf\u{1F000}-\u{1FFFF}]\ufe0f?\s)|(\s[\u2190-\u2bff\u2600-\u27bf\u{1F000}-\u{1FFFF}]\ufe0f?)$/u
        const deMap = de as Record<string, string>
        const enMap = en as Record<string, string>
        const badDe = deKeys.filter(k => !allowed.has(k) && edgeIcon.test(deMap[k]))
        const badEn = enKeys.filter(k => !allowed.has(k) && edgeIcon.test(enMap[k]))
        expect(badDe).toEqual([])
        expect(badEn).toEqual([])
    })
})
