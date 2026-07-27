/**
 * Feature #73 — Icon-Sprache & Touch-Affordanz, als Lint-Test statt als einmaliger Durchgang.
 *
 * Die App läuft auf Touch-Geräten. Dort gibt es keinen Hover, ein `title`-Tooltip ist also
 * unsichtbar — und wenn er der einzige Hinweis ist, was ein Knopf tut, ist die Aktion effektiv
 * unbeschriftet. Genau diese Lektion haben die Bug-Fix-Batches #51/#52/#58–61 mehrfach gelernt;
 * dieser Test hält sie fest, damit sie nicht ein siebtes Mal gelernt werden muss.
 *
 * Zwei Regeln:
 *   1. Kein `title=` auf einem nativen DOM-Element. Sichtbares Label oder `aria-label` —
 *      ein Tooltip ist auf Touch keine Option.
 *   2. Ein `<button>`, dessen sichtbarer Inhalt nur ein Icon/Emoji ist, braucht `aria-label`.
 *
 * Ausnahmen stehen unten mit Begründung. Eine neue Ausnahme hinzuzufügen ist erlaubt — sie soll
 * nur eine bewusste, dokumentierte Entscheidung sein statt stillschweigend durchzurutschen.
 */
import {describe, it, expect} from 'vitest'
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {resolve, relative} from 'node:path'

const SRC = resolve(__dirname, '..')

interface Tag {
    name: string
    attrs: string
    line: number
    /** Index just past the `>` of this opening tag. */
    bodyStart: number
    selfClosing: boolean
}

/**
 * Walk JSX opening tags with brace/quote awareness.
 *
 * A regex cannot do this: attribute expressions carry both nested braces and `>` characters
 * (`onClick={() => {}}`), so any `[^>]*` attribute pattern ends the tag in the middle of a
 * handler and silently skips it — which is exactly how an earlier version of this test passed
 * against a deliberately planted violation.
 */
function scanTags(source: string): Tag[] {
    const tags: Tag[] = []
    for (let i = 0; i < source.length; i++) {
        if (source[i] !== '<' || !/[A-Za-z]/.test(source[i + 1] ?? '')) continue
        let j = i + 1
        while (j < source.length && /[A-Za-z0-9.]/.test(source[j])) j++
        const name = source.slice(i + 1, j)
        // Scan attributes until the matching `>` at brace depth 0, outside any string.
        let depth = 0
        let quote: string | null = null
        let k = j
        for (; k < source.length; k++) {
            const c = source[k]
            if (quote) {
                if (c === '\\') k++
                else if (c === quote) quote = null
                continue
            }
            if (c === '"' || c === "'" || c === '`') { quote = c; continue }
            if (c === '{') { depth++; continue }
            if (c === '}') { depth--; continue }
            if (c === '>' && depth === 0) break
        }
        if (k >= source.length) continue
        const attrs = source.slice(j, k)
        tags.push({
            name,
            attrs,
            line: source.slice(0, i).split('\n').length,
            bodyStart: k + 1,
            selfClosing: source[k - 1] === '/',
        })
        i = k
    }
    return tags
}

/** Text between this opening tag and its matching close tag, honouring nesting. */
function elementBody(source: string, tag: Tag): string {
    if (tag.selfClosing) return ''
    const open = `<${tag.name}`
    const close = `</${tag.name}>`
    let depth = 1
    let pos = tag.bodyStart
    while (depth > 0) {
        const nextOpen = source.indexOf(open, pos)
        const nextClose = source.indexOf(close, pos)
        if (nextClose === -1) return source.slice(tag.bodyStart)
        if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + open.length; continue }
        depth--
        if (depth === 0) return source.slice(tag.bodyStart, nextClose)
        pos = nextClose + close.length
    }
    return ''
}

/**
 * `title` on these components is a real, visible label (sheet heading, card header, chart
 * title) — not an HTML tooltip. Only lowercase tags are native DOM elements anyway; this list
 * exists so the intent is written down rather than inferred from the casing rule.
 */
const TITLE_PROP_COMPONENTS = [
    'Sheet', 'CardActionMenu', 'ExpandableCard', 'Section', 'CumulativeChart',
]

/**
 * Buttons that are exempt from rule 2, each with the reason. Format: `path:visibleText`.
 * Empty for now — every icon-only control in the app carries an `aria-label`.
 */
const ICON_ONLY_EXCEPTIONS: string[] = []

function skipFile(rel: string): boolean {
    return rel.includes('__tests__') || rel.endsWith('.d.ts')
}

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = resolve(dir, name)
        if (statSync(full).isDirectory()) walk(full, out)
        else if (full.endsWith('.tsx')) out.push(full)
    }
    return out
}

const FILES = walk(SRC).filter(f => !skipFile(relative(SRC, f)))

/** Icon/emoji only: no letters, no digits, no JSX expression — nothing a screen reader can use. */
const ICON_ONLY = /^[^\p{L}\p{N}{<]{1,3}$/u

describe('touch affordance', () => {
    it('scans the whole component tree', () => {
        expect(FILES.length).toBeGreaterThan(30)
    })

    it('has no `title` tooltip on a native DOM element', () => {
        const offenders: string[] = []
        for (const file of FILES) {
            const source = readFileSync(file, 'utf-8')
            for (const tag of scanTags(source)) {
                if (!/(^|\s)title=/.test(tag.attrs)) continue
                if (TITLE_PROP_COMPONENTS.includes(tag.name)) continue
                if (/^[A-Z]/.test(tag.name)) continue
                offenders.push(`${relative(SRC, file)}:${tag.line} <${tag.name}>`)
            }
        }
        expect(offenders).toEqual([])
    })

    it('gives every icon-only button an accessible name', () => {
        const offenders: string[] = []
        for (const file of FILES) {
            const source = readFileSync(file, 'utf-8')
            for (const tag of scanTags(source)) {
                if (tag.name !== 'button') continue
                if (/(^|\s)aria-label(?:ledby)?=/.test(tag.attrs)) continue
                const text = elementBody(source, tag).replace(/<[^>]*>/g, '').trim()
                if (!ICON_ONLY.test(text)) continue
                const key = `${relative(SRC, file)}:${text}`
                if (ICON_ONLY_EXCEPTIONS.includes(key)) continue
                offenders.push(`${relative(SRC, file)}:${tag.line} ${JSON.stringify(text)}`)
            }
        }
        expect(offenders).toEqual([])
    })
})
