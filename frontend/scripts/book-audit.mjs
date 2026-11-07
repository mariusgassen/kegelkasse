#!/usr/bin/env node
// Component-book audit: counts hand-rolled patterns in non-test .tsx files so the numbers in
// src/lib/book/inventory.ts can be refreshed after a migration.
//
//   npm run book:audit
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'

const SRC = new URL('../src', import.meta.url).pathname

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === '__tests__') continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (p.endsWith('.tsx')) out.push(p)
    }
    return out
}

const files = walk(SRC).map(p => ({path: relative(SRC, p), text: readFileSync(p, 'utf8')}))

const CHECKS = [
    ['btn-primary', /btn-primary/g],
    ['btn-secondary', /btn-secondary/g],
    ['btn-danger', /btn-danger/g],
    ['btn-ghost (dead)', /btn-ghost/g],
    ['kce-card', /kce-card/g],
    ['kce-input', /kce-input/g],
    ['field-label', /field-label/g],
    ['sec-heading', /sec-heading/g],
    ['<Sheet', /<Sheet\b/g],
    ['<Empty', /<Empty\b/g],
    ['hand-rolled empty state', /text-center[^"]*text-muted|text-muted[^"]*text-center/g],
    ['tab strips (overflow-x-auto)', /overflow-x-auto/g],
    ['identical tab pill', /flex-shrink-0 px-3 py-1\.5 rounded-lg text-xs font-bold transition-all/g],
    ['role="switch"', /role="switch"/g],
    ['type="checkbox"', /type="checkbox"/g],
    ['hex literal', /#[0-9a-fA-F]{6}\b/g],
    ['rgba literal', /rgba\(/g],
    ['tailwind palette colour', /\b(text|bg|border)-(red|green|blue|yellow|amber|gray|slate|zinc|emerald|orange)-\d/g],
    ['undefined text-kce-text', /text-kce-text/g],
    ['inline style colour', /style=\{\{[^}]*(color|background)/g],
    ['hand-rolled uppercase label', /text-xs font-bold text-muted uppercase tracking-wider/g],
]

const rows = CHECKS.map(([label, re]) => {
    let hits = 0, hitFiles = 0
    for (const f of files) {
        const n = (f.text.match(re) ?? []).length
        if (n) { hits += n; hitFiles++ }
    }
    return {label, hits, files: hitFiles}
})

const w = Math.max(...rows.map(r => r.label.length))
console.log(`Component-book audit — ${files.length} files\n`)
for (const r of rows) console.log(`${r.label.padEnd(w)}  ${String(r.hits).padStart(5)} hits  ${String(r.files).padStart(3)} files`)
