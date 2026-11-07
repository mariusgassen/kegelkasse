/**
 * Component book (`/book`) — inventory of the UI building blocks, the design guide and a live
 * specimen sheet. Developer-facing, English only, not linked from the navigation.
 *
 * Page 1 (Inventory) answers "what do we have, and what is copied by hand?". Its data lives in
 * `lib/book/inventory.ts`; refresh the counts with `npm run book:audit`.
 */
import {type ReactNode, useState} from 'react'
import {useHashTab} from '@/hooks/usePage.ts'
import {DISTRIBUTIONS, DUPLICATES, NEXT_STEPS, PRIMITIVES, type Status} from '@/lib/book/inventory'
import {Avatar} from '@/components/ui/Avatar'
import {ChipSelect} from '@/components/ui/ChipSelect'
import {Empty} from '@/components/ui/Empty'
import {ExpandableCard} from '@/components/ui/ExpandableCard'
import {MemberRow} from '@/components/ui/MemberRow'
import {ModeToggle} from '@/components/ui/ModeToggle'
import {SearchInput} from '@/components/ui/SearchInput'
import {Sheet} from '@/components/ui/Sheet'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {StatTile} from '@/components/ui/StatTile'
import {showToast} from '@/components/ui/Toast'

type BookTab = 'inventory' | 'guide' | 'components'

const TABS: { id: BookTab; label: string }[] = [
    {id: 'inventory', label: '📋 Inventory'},
    {id: 'guide', label: '🎨 Design guide'},
    {id: 'components', label: '🧩 Components'},
]

const STATUS_LABEL: Record<Status, string> = {
    component: 'component',
    'css-class': 'CSS class',
    pattern: 'pattern',
}

export function BookPage() {
    const [tab, setTab] = useHashTab<BookTab>('inventory', TABS.map(t => t.id))

    return (
        <div className="page-scroll px-3 pt-3 pb-24">
            <div className="sec-heading">Component book</div>
            <p className="text-sm text-muted mb-3">
                What the UI is made of, how it should look, and where it is still copied by hand.
            </p>
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                            onClick={() => setTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
            </div>
            {tab === 'inventory' && <InventoryTab/>}
            {tab === 'guide' && <GuideTab/>}
            {tab === 'components' && <ComponentsTab/>}
        </div>
    )
}

// ── Inventory ────────────────────────────────────────────────────────────────

function InventoryTab() {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
                <StatTile value={PRIMITIVES.length} label="Shared blocks" size="lg"/>
                <StatTile value={DUPLICATES.length} label="Duplicated patterns" size="lg" tone="negative"/>
                <StatTile value={DUPLICATES.filter(d => d.priority === 1).length} label="Do first" size="lg"/>
            </div>

            <section>
                <div className="sec-heading">Duplicated patterns</div>
                <p className="text-sm text-muted mb-2">
                    Snapshot of 2026-11-06. Refresh the counts with <code>npm run book:audit</code>.
                </p>
                <div className="space-y-2">
                    {[...DUPLICATES].sort((a, b) => a.priority - b.priority).map(d => (
                        <ExpandableCard key={d.id}
                                        title={
                                            <span className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-accent-tint-fg bg-accent-tint rounded-full px-2 py-0.5">P{d.priority}</span>
                                                <span className="text-sm font-bold">{d.title}</span>
                                            </span>
                                        }>
                            <div className="space-y-2 text-sm">
                                <p>{d.finding}</p>
                                <Row label="Count" value={d.count}/>
                                <Row label="Where" value={d.where}/>
                                <Row label="Proposal" value={d.proposal}/>
                            </div>
                        </ExpandableCard>
                    ))}
                </div>
            </section>

            <section>
                <div className="sec-heading">What already exists</div>
                <div className="kce-card divide-y divide-line">
                    {PRIMITIVES.map(p => (
                        <div key={p.name} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-bold break-words min-w-0">{p.name}</div>
                                <span className="text-xs font-bold text-muted bg-surface-2 rounded-full px-2 py-0.5 flex-shrink-0">{STATUS_LABEL[p.status]}</span>
                            </div>
                            <div className="text-sm text-muted">{p.use}</div>
                            <div className="text-xs text-muted mt-0.5">{p.source} · uses: {p.uses}</div>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <div className="sec-heading">Scales in use</div>
                <div className="grid gap-2">
                    {DISTRIBUTIONS.map(d => {
                        const max = Math.max(...d.rows.map(r => r.count))
                        return (
                            <div key={d.label} className="kce-card p-3">
                                <div className="field-label">{d.label}</div>
                                {d.rows.map(r => (
                                    <div key={r.name} className="flex items-center gap-2 text-xs py-0.5">
                                        <span className="w-32 flex-shrink-0 text-muted">{r.name}</span>
                                        <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                                            <span className="block h-full bg-accent" style={{width: `${(r.count / max) * 100}%`}}/>
                                        </span>
                                        <span className="w-8 text-right font-bold">{r.count}</span>
                                    </div>
                                ))}
                            </div>
                        )
                    })}
                </div>
            </section>

            <section>
                <div className="sec-heading">Next migrations</div>
                <ol className="kce-card p-3 space-y-2">
                    {NEXT_STEPS.map(n => (
                        <li key={n.step} className="text-sm">
                            <span className="font-bold">{n.step}</span>
                            <span className="text-muted"> — {n.why}</span>
                        </li>
                    ))}
                </ol>
            </section>
        </div>
    )
}

function Row({label, value}: { label: string; value: ReactNode }) {
    return (
        <div className="flex gap-2 text-sm">
            <span className="w-20 flex-shrink-0 text-xs font-bold text-muted uppercase tracking-wider pt-0.5">{label}</span>
            <span className="min-w-0 break-words">{value}</span>
        </div>
    )
}

// ── Design guide ─────────────────────────────────────────────────────────────

/** Token → example classes. Literal class names so Tailwind keeps them. */
const SWATCHES: { name: string; role: string; cls: string }[] = [
    {name: 'canvas', role: 'Page background', cls: 'bg-canvas border border-line'},
    {name: 'surface', role: 'Cards', cls: 'bg-surface border border-line'},
    {name: 'surface-2', role: 'Nested cards, inactive tabs', cls: 'bg-surface-2 border border-line'},
    {name: 'line', role: 'Dividers, borders', cls: 'bg-line'},
    {name: 'accent', role: 'Brand fill', cls: 'bg-accent'},
    {name: 'accent-tint', role: 'Badge background', cls: 'bg-accent-tint'},
    {name: 'accent-deep', role: 'Deep brand fill', cls: 'bg-accent-deep'},
    {name: 'danger', role: 'Destructive, money owed', cls: 'bg-danger'},
    {name: 'danger-tint', role: 'Danger badge / button', cls: 'bg-danger-tint'},
    {name: 'positive', role: 'Success, credit', cls: 'bg-positive'},
    {name: 'positive-tint', role: 'Positive badge', cls: 'bg-positive-tint'},
    {name: 'tier-bronze', role: 'Medal', cls: 'bg-tier-bronze'},
    {name: 'tier-silver', role: 'Medal', cls: 'bg-tier-silver'},
]

const TEXT_SPECIMENS: { cls: string; label: string }[] = [
    {cls: 'text-ink', label: 'ink — primary text'},
    {cls: 'text-muted', label: 'muted — labels, meta'},
    {cls: 'text-accent-fg', label: 'accent-fg — brand as text'},
    {cls: 'text-danger-fg', label: 'danger-fg — owed / error'},
    {cls: 'text-positive-fg', label: 'positive-fg — credit / ok'},
]

function GuideTab() {
    return (
        <div className="space-y-4">
            <section className="kce-card p-3 space-y-2 text-sm">
                <div className="field-label">Principles</div>
                <ul className="list-disc pl-5 space-y-1">
                    <li><b>Tokens, never literals.</b> Colour is chosen by role; the theme is club-configurable × dark/light.</li>
                    <li><b>Lucide = control, emoji = content.</b> Every icon-only button has an aria-label; no <code>title=</code>.</li>
                    <li><b>12px is the floor.</b> Express hierarchy with weight, colour and spacing.</li>
                    <li><b>Motion by role</b> (<code>--motion-fast|base|slow|ambient</code>), and respect reduced motion.</li>
                    <li><b>Touch first.</b> A tappable row shows a chevron; rows without an action stay inert.</li>
                    <li><b>One component per pattern.</b> If you copy markup a third time, it belongs in <code>components/ui</code> and in this book.</li>
                </ul>
            </section>

            <section>
                <div className="sec-heading">Colour roles</div>
                <div className="grid grid-cols-2 gap-2">
                    {SWATCHES.map(s => (
                        <div key={s.name} className="kce-card p-2 flex items-center gap-2">
                            <span className={`w-9 h-9 rounded-lg flex-shrink-0 ${s.cls}`}/>
                            <div className="min-w-0">
                                <div className="text-sm font-bold truncate">{s.name}</div>
                                <div className="text-xs text-muted truncate">{s.role}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="kce-card p-3 mt-2 space-y-1">
                    {TEXT_SPECIMENS.map(s => <div key={s.cls} className={`text-sm font-bold ${s.cls}`}>{s.label}</div>)}
                    <p className="text-xs text-muted pt-1">
                        <code>-fg</code> = adjusted until readable as text on the page · <code>on-</code> = text colour for use on top of the fill.
                    </p>
                </div>
            </section>

            <section>
                <div className="sec-heading">Type scale</div>
                <div className="kce-card p-3 space-y-1.5">
                    <div className="font-display font-bold text-2xl">text-2xl display — page numbers</div>
                    <div className="font-display font-bold text-xl">text-xl display — headline values</div>
                    <div className="font-display font-bold text-base text-accent-fg">text-base display — section heading</div>
                    <div className="text-sm">text-sm — content a member reads</div>
                    <div className="text-xs text-muted">text-xs — smallest allowed (12px): labels, meta</div>
                </div>
            </section>

            <section>
                <div className="sec-heading">Shape &amp; spacing</div>
                <div className="kce-card p-3 text-sm space-y-1">
                    <div><b>Cards</b> 16px radius, 1px line (<code>kce-card</code>), padding <code>p-3</code> (dense) or <code>p-4</code>.</div>
                    <div><b>Controls</b> <code>rounded-lg</code>; small buttons <code>rounded-md</code>; pills and avatars <code>rounded-full</code>.</div>
                    <div><b>Sheets</b> bottom sheets only through <code>&lt;Sheet&gt;</code>.</div>
                    <div><b>Page</b> scroll container <code>page-scroll px-3 pb-24</code> so content clears the bottom bar.</div>
                    <div className="text-xs text-muted pt-1">Radius audit: see “Scales in use” on the Inventory tab — <code>rounded</code> (4px) and <code>rounded-xl</code> are drift candidates.</div>
                </div>
            </section>

            <section className="kce-card p-3 text-sm space-y-1">
                <div className="field-label">Writing &amp; data</div>
                <ul className="list-disc pl-5 space-y-1">
                    <li>All app strings via <code>useT()</code>, keys in <code>de.ts</code> first. (This book is the one exception: English, developer-facing.)</li>
                    <li>Show <code>member.nickname || member.name</code>; mark the current user with <code>common.me</code>; sort them first.</li>
                    <li>After a mutation: toast, then invalidate every query that depends on the data.</li>
                </ul>
            </section>
        </div>
    )
}

// ── Components ───────────────────────────────────────────────────────────────

function Specimen({title, note, children}: { title: string; note?: ReactNode; children: ReactNode }) {
    return (
        <section>
            <div className="sec-heading">{title}</div>
            {note && <p className="text-xs text-muted mb-2">{note}</p>}
            <div className="kce-card p-3">{children}</div>
        </section>
    )
}

function ComponentsTab() {
    const [sheet, setSheet] = useState(false)
    const [chips, setChips] = useState<(string | number)[]>(['a'])
    const [mode, setMode] = useState('one')
    const [search, setSearch] = useState('')
    const [sw, setSw] = useState(true)
    const [pill, setPill] = useState('x')

    return (
        <div className="space-y-4">
            <Specimen title="Buttons" note="CSS classes in index.css. A <Button> component is proposed (see Inventory).">
                <div className="flex flex-wrap gap-2 items-center">
                    <button type="button" className="btn-primary">Primary</button>
                    <button type="button" className="btn-secondary">Secondary</button>
                    <button type="button" className="btn-danger">Danger</button>
                    <button type="button" className="btn-primary" disabled>Disabled</button>
                    <button type="button" className="btn-primary btn-sm">Small</button>
                    <button type="button" className="btn-secondary btn-xs">Extra small</button>
                </div>
            </Specimen>

            <Specimen title="Form fields" note="kce-input serves input, select and textarea. A <Field> wrapper is proposed.">
                <label className="field-label">Label</label>
                <input className="kce-input mb-2" placeholder="Text input"/>
                <select className="kce-input mb-2" defaultValue="a"><option value="a">Select</option></select>
                <textarea className="kce-input" rows={2} placeholder="Textarea"/>
            </Specimen>

            <Specimen title="Search" note="<SearchInput>">
                <SearchInput value={search} onChange={setSearch} placeholder="Filter…"/>
            </Specimen>

            <Specimen title="Chips &amp; segments" note="<ChipSelect> (multi) and <ModeToggle> (single, inside a panel).">
                <ChipSelect options={[{id: 'a', label: 'Marius'}, {id: 'b', label: 'Tina'}, {id: 'c', label: 'Domi'}]}
                            selected={chips} onChange={setChips}
                            onSelectAll={() => setChips(['a', 'b', 'c'])} onSelectNone={() => setChips([])}
                            label="Players"/>
                <div className="mt-3">
                    <ModeToggle options={[{value: 'one', label: 'One'}, {value: 'two', label: 'Two'}, {value: 'three', label: 'Three'}]}
                                value={mode} onChange={setMode}/>
                </div>
            </Specimen>

            <Specimen title="Tab strip (duplicated)" note="Copy-pasted on every page today. Proposed <Tabs>.">
                <div className="flex gap-1 overflow-x-auto pb-1">
                    {['x', 'y', 'z'].map(id => (
                        <button key={id} type="button"
                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${pill === id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                                onClick={() => setPill(id)}>
                            Tab {id.toUpperCase()}
                        </button>
                    ))}
                </div>
            </Specimen>

            <Specimen title="Switch (duplicated)" note="Hand-built in ClubAdminPage ×4 and SchedulePage. Proposed <Switch>.">
                <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" role="switch" aria-checked={sw} aria-label="Specimen switch"
                            onClick={() => setSw(v => !v)}
                            className="relative w-11 h-6 rounded-full flex-shrink-0 transition-colors"
                            style={{background: sw ? 'var(--accent)' : 'var(--surface-2)'}}>
                        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                              style={{transform: sw ? 'translateX(20px)' : 'none'}}/>
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-ink">Setting label</div>
                        <p className="text-xs text-muted mt-0.5">Hint text explaining the setting.</p>
                    </div>
                </label>
            </Specimen>

            <Specimen title="Cards &amp; tiles" note="kce-card, <StatTile>, <ExpandableCard>.">
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <StatTile value="12" label="Abende"/>
                    <StatTile value="48,50 €" label="Offen" tone="negative"/>
                    <StatTile value="+9 €" label="Guthaben" tone="positive"/>
                </div>
                <ExpandableCard title={<span className="text-sm font-bold">Expandable card</span>}>
                    <p className="text-sm text-muted">Collapsed by default; chevron and aria-expanded are wired.</p>
                </ExpandableCard>
            </Specimen>

            <Specimen title="Members" note="<MemberRow> with <Avatar>; tappable rows show a chevron.">
                <div className="space-y-2">
                    <MemberRow name="Marius" subtitle="Marius Gassen" isMe isKing/>
                    <MemberRow name="Tina" subtitle="Tina Muster" onClick={() => showToast('Row tapped', 'info')}/>
                    <MemberRow name="Gast Gerd" avatarVariant="muted"/>
                </div>
                <div className="flex gap-2 mt-3 items-center">
                    <Avatar name="Sm" size="sm"/><Avatar name="Md"/><Avatar name="Lg" size="lg"/>
                </div>
            </Specimen>

            <Specimen title="Feedback" note="<Empty>, <Skeleton*>, showToast, <Sheet>.">
                <Empty icon="🎳" text="Nothing here yet"/>
                <SkeletonRows rows={2}/>
                <div className="flex gap-2 mt-3">
                    <button type="button" className="btn-secondary btn-sm" onClick={() => showToast('Saved')}>Toast</button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setSheet(true)}>Open sheet</button>
                </div>
            </Specimen>

            <Sheet open={sheet} onClose={() => setSheet(false)} title="Specimen sheet">
                <p className="text-sm text-muted mb-3">Every bottom sheet goes through this component.</p>
                <button type="button" className="btn-primary w-full" onClick={() => setSheet(false)}>Done</button>
            </Sheet>
        </div>
    )
}
