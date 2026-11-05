#!/usr/bin/env node
// Turns release-please's CHANGELOG.md (repo root) into src/whatsNew/releases.json,
// the bilingual data behind the in-app "Was ist neu" sheet.
//
//   node --experimental-strip-types frontend/scripts/release-notes.mjs
//
// Runs on the release PR (.github/workflows/release-please.yml). CHANGELOG.md is not in
// the frontend's Docker build context, which is why the data is copied into src/.
// Translations already in releases.json are kept; missing German texts are translated
// with Claude when ANTHROPIC_API_KEY is set. Without a key (or if the API fails) the
// entries stay English-only and the app falls back to the English text.

import {readFileSync, writeFileSync, existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'
import {parseChangelog, mergeTranslations, missingTranslations, applyTranslations} from '../src/lib/changelog.ts'

const here = dirname(fileURLToPath(import.meta.url))
const CHANGELOG = resolve(here, '../../CHANGELOG.md')
const OUT = resolve(here, '../src/whatsNew/releases.json')
const MODEL = process.env.RELEASE_NOTES_MODEL || 'claude-sonnet-5-5'

const SYSTEM = `You translate release notes of "Kegelkasse", a web app for a German 9-pin bowling club
(Kegelclub), from English into German. The readers are club members, many of them older and not technical.
Write natural, short German in the informal "du" form, as one sentence fragment like the source.
Keep these app terms exactly: Kegelabend, Kegelname, Kasse, Strafe(n), Kegelfahrt, VGA, König, Gast,
Termine, Saisonabschluss, Kassenprüfung. Keep product names, numbers and emoji. Do not add explanations.`

async function translate(items) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 8000,
            system: SYSTEM,
            messages: [{
                role: 'user',
                content: `Translate the "en" text of every item to German. Return one entry per id.\n\n${JSON.stringify(items)}`,
            }],
            output_config: {
                format: {
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        properties: {
                            translations: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {id: {type: 'string'}, de: {type: 'string'}},
                                    required: ['id', 'de'],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ['translations'],
                        additionalProperties: false,
                    },
                },
            },
        }),
    })
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
    const body = await res.json()
    if (body.stop_reason === 'refusal' || body.stop_reason === 'max_tokens') throw new Error(`stop_reason ${body.stop_reason}`)
    const text = body.content?.find(b => b.type === 'text')?.text
    const parsed = JSON.parse(text ?? '{}')
    return Object.fromEntries((parsed.translations ?? []).map(t => [t.id, t.de]))
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')).releases ?? [] : []
const fresh = existsSync(CHANGELOG) ? parseChangelog(readFileSync(CHANGELOG, 'utf-8')) : []
let releases = mergeTranslations(fresh, previous)

const missing = missingTranslations(releases, 'de')
if (missing.length && process.env.ANTHROPIC_API_KEY) {
    try {
        releases = applyTranslations(releases, 'de', await translate(missing))
    } catch (e) {
        console.warn(`release-notes: translation skipped (${e.message})`)
    }
} else if (missing.length) {
    console.warn(`release-notes: ${missing.length} entries without German text (no ANTHROPIC_API_KEY)`)
}

writeFileSync(OUT, JSON.stringify({releases}, null, 2) + '\n')
const left = missingTranslations(releases, 'de').length
console.log(`release-notes: ${releases.length} releases written, ${left} untranslated`)
