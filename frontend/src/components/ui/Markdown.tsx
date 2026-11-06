import {Fragment, type ReactNode} from 'react'

/**
 * Tiny, dependency-free Markdown renderer for short member-facing texts (AI recaps, announcements).
 * Supports headings, bullet/numbered lists, paragraphs, bold, italic and inline code.
 * Builds React elements only (never raw HTML), so user text cannot inject markup.
 *
 * Links (`[label](href)`) are only rendered through `renderLink` — the caller decides what an
 * href may do (the AI search turns its validated app:/docs: links into buttons). Without it,
 * a link shows as its plain label, so announcements can't smuggle in clickable URLs.
 */
const INLINE = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
const LINK = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/

export type RenderLink = (label: string, href: string, key: number) => ReactNode

function inline(text: string, renderLink?: RenderLink): ReactNode[] {
    return text.split(INLINE).filter(Boolean).map((part, i) => {
        const link = LINK.exec(part)
        if (link) return renderLink?.(link[1], link[2], i) ?? <Fragment key={i}>{link[1]}</Fragment>
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
            return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
            return <code key={i} className="px-1 rounded bg-surface-2">{part.slice(1, -1)}</code>
        if ((part.startsWith('*') && part.endsWith('*') || part.startsWith('_') && part.endsWith('_')) && part.length > 2)
            return <em key={i}>{part.slice(1, -1)}</em>
        return <Fragment key={i}>{part}</Fragment>
    })
}

type Block =
    | { t: 'p'; lines: string[] }
    | { t: 'h'; level: number; text: string }
    | { t: 'ul' | 'ol'; items: string[] }

function parse(src: string): Block[] {
    const blocks: Block[] = []
    for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
        const line = raw.trimEnd()
        const last = blocks[blocks.length - 1]
        const h = /^(#{1,6})\s+(.*)$/.exec(line)
        const ul = /^\s*[-*+]\s+(.*)$/.exec(line)
        const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (!line.trim()) blocks.push({t: 'p', lines: []})
        else if (h) blocks.push({t: 'h', level: h[1].length, text: h[2]})
        else if (ul) {
            if (last?.t === 'ul') last.items.push(ul[1]); else blocks.push({t: 'ul', items: [ul[1]]})
        } else if (ol) {
            if (last?.t === 'ol') last.items.push(ol[1]); else blocks.push({t: 'ol', items: [ol[1]]})
        } else if (last?.t === 'p') last.lines.push(line)
        else blocks.push({t: 'p', lines: [line]})
    }
    return blocks.filter(b => b.t !== 'p' || b.lines.length > 0)
}

export function Markdown({text, className = '', renderLink}: { text: string; className?: string; renderLink?: RenderLink }) {
    const il = (s: string) => inline(s, renderLink)
    return (
        <div className={`flex flex-col gap-2 leading-relaxed ${className}`} data-testid="markdown">
            {parse(text).map((b, i) => {
                if (b.t === 'h') return <p key={i} className="font-bold text-ink">{il(b.text)}</p>
                if (b.t === 'ul') return (
                    <ul key={i} className="list-disc pl-5">{b.items.map((it, j) => <li key={j}>{il(it)}</li>)}</ul>)
                if (b.t === 'ol') return (
                    <ol key={i} className="list-decimal pl-5">{b.items.map((it, j) => <li key={j}>{il(it)}</li>)}</ol>)
                if (b.t !== 'p') return null
                return <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br/>}{il(l)}</Fragment>)}</p>
            })}
        </div>
    )
}
