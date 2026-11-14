/**
 * Kassenbericht PDF — built in the browser from `GET /reports/data` with the pdfcn components
 * (Forme renderer). Loaded lazily by `api.downloadReport`, so the WASM engine never touches the
 * main bundle. The Excel export stays server-side.
 */
import type {ReactNode} from 'react'
import {Document, Page} from '@formepdf/react'
import {Fixed, Image, Text, View} from '@/lib/pdf-primitives'
import {readableOn, ensureContrast, mixOver} from '@/lib/contrast'
import {PageNumber} from '@/components/pdf/page-number/page-number'
import {Table, TableBody, TableCell, TableFooter, TableHeader, TableRow} from '@/components/pdf/table/table'
import {PdfcnThemeProvider} from '@/components/pdf/theme-provider'
import type {ReportData, ReportMonthlyRow} from '@/types'

export interface ReportBranding {
    /** Brand colour (hex) — header band, headings, table header tint. */
    color?: string | null
    /** Club logo as a PNG/JPEG data URI plus its pixel size (for the aspect ratio). */
    logo?: { src: string; width: number; height: number } | null
}

const DEFAULT_ACCENT = '#2f5d3a'
const POSITIVE = '#15803d'
const NEGATIVE = '#b91c1c'
const MUTED = '#71717a'
const WHITE = '#ffffff'

const PORTRAIT_W = 523 // A4 (595pt) minus 2 × 36pt margin
const LANDSCAPE = {width: 842, height: 595}
const LANDSCAPE_W = 770
const MARGIN = 36

/** "1.234,56 €" — the same format the Excel export and the app use. */
export function reportEuro(v: number): string {
    return new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'})
        .format(v)
        .replace(/[  ]/g, ' ')
}

/** Amount without the currency sign, for dense tables whose caption already says "€". */
export function reportNumber(v: number): string {
    return new Intl.NumberFormat('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(v)
}

/** Plus/minus sign *before* the amount: "+12,00 €" / "-12,00 €". */
export function reportSigned(v: number): string {
    const rounded = Math.round(v * 100) / 100
    return rounded > 0 ? `+${reportEuro(rounded)}` : reportEuro(rounded)
}

const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu

/**
 * The PDF's built-in Helvetica has no emoji glyphs (they render as "?"), so strip them —
 * penalty types and names carry their icons in the app, which the PDF has no use for.
 */
export function pdfText(v: string): string {
    return v.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim()
}

function sanitize<T>(v: T): T {
    if (typeof v === 'string') return pdfText(v) as T
    if (Array.isArray(v)) return v.map(sanitize) as T
    if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)])) as T
    }
    return v
}

type Tone = 'pos' | 'neg' | 'muted'
const toneColor = (tone: Tone | undefined, fallback: string) =>
    tone === 'pos' ? POSITIVE : tone === 'neg' ? NEGATIVE : tone === 'muted' ? MUTED : fallback
const signTone = (v: number): Tone | undefined => (v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : undefined)

const FONT = 9
const HEAD_FONT = 8.5

function Cell({w, align, children, header, footer, tone, bold}: {
    w: number; align?: 'left' | 'right'; children: string; header?: boolean; footer?: boolean; tone?: Tone; bold?: boolean
}) {
    return (
        <TableCell width={w} align={align} header={header} footer={footer} style={{paddingHorizontal: 5, paddingVertical: 4}}>
            <Text style={{
                fontFamily: 'Helvetica',
                fontSize: header ? HEAD_FONT : FONT,
                fontWeight: header || footer || bold ? 700 : 400,
                color: header ? MUTED : toneColor(tone, '#18181b'),
                textAlign: align ?? 'left',
            }}>{children}</Text>
        </TableCell>
    )
}

function Section({title, accent, children}: { title: string; accent: string; children: ReactNode }) {
    return (
        <View style={{marginTop: 14, marginBottom: 4}}>
            <View style={{borderBottomWidth: 1.5, borderBottomColor: accent, paddingBottom: 3, marginBottom: 6}}>
                <Text style={{fontFamily: 'Helvetica', fontSize: 13, fontWeight: 700, color: accent}}>{title}</Text>
            </View>
            {children}
        </View>
    )
}

interface Col {
    w: number
    head: string
    align?: 'left' | 'right'
}

function DataTable({cols, rows, footer, tint}: {
    cols: Col[]
    rows: { cells: string[]; tones?: (Tone | undefined)[]; bold?: boolean | boolean[] }[]
    footer?: { cells: string[]; tones?: (Tone | undefined)[] }
    tint: string
}) {
    return (
        <Table variant="line" zebraStripe>
            <TableHeader>
                <TableRow header style={{backgroundColor: tint}}>
                    {cols.map((c, i) => <Cell key={i} w={c.w} align={c.align} header>{c.head}</Cell>)}
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r, ri) => (
                    <TableRow key={ri}>
                        {r.cells.map((c, i) => (
                            <Cell key={i} w={cols[i].w} align={cols[i].align} tone={r.tones?.[i]}
                                  bold={Array.isArray(r.bold) ? r.bold[i] : r.bold}>{c}</Cell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
            {footer && (
                <TableFooter>
                    <TableRow footer>
                        {footer.cells.map((c, i) => (
                            <Cell key={i} w={cols[i].w} align={cols[i].align} tone={footer.tones?.[i]} footer>{c}</Cell>
                        ))}
                    </TableRow>
                </TableFooter>
            )}
        </Table>
    )
}

/** Fixed widths (pt) for the leading columns; the one `rest` column absorbs the remainder. */
const fill = (total: number, widths: (number | 'rest')[]): number[] => {
    const fixed = widths.reduce<number>((a, w) => a + (w === 'rest' ? 0 : w), 0)
    return widths.map(w => (w === 'rest' ? Math.max(40, total - fixed) : w))
}

function MonthlyTable({months, rows, tint}: { months: string[]; rows: ReportMonthlyRow[]; tint: string }) {
    const fixed = 62
    const nameW = 96
    const monthW = Math.min(64, Math.max(34, Math.floor((LANDSCAPE_W - nameW - fixed * 3) / Math.max(months.length, 1))))
    const cols: Col[] = [
        {w: nameW, head: 'Spieler'},
        ...months.map(m => ({w: monthW, head: m, align: 'right' as const})),
        {w: fixed, head: 'Strafen', align: 'right'},
        {w: fixed, head: 'Einz.', align: 'right'},
        {w: fixed, head: 'Saldo', align: 'right'},
    ]
    const signedNumber = (v: number) => (Math.round(v * 100) > 0 ? '+' : '') + reportNumber(v)
    return (
        <DataTable
            cols={cols}
            tint={tint}
            rows={rows.map(r => ({
                cells: [
                    r.name,
                    ...r.months.map(v => (v ? reportNumber(v) : '')),
                    reportNumber(r.penalties), reportNumber(r.payments), signedNumber(r.balance),
                ],
                tones: [...new Array<Tone | undefined>(months.length + 3).fill(undefined), signTone(r.balance)],
            }))}
        />
    )
}

function AccountMonthsTable({accounts, tint}: { accounts: ReportData['accounts']; tint: string }) {
    const months = (accounts.find(a => (a.months?.length ?? 0) > 0)?.months ?? []).map(m => m.month)
    const nameW = 100, kindW = 62, perChunk = 10
    const monthW = Math.min(64, Math.floor((LANDSCAPE_W - nameW - kindW) / Math.min(perChunk, Math.max(months.length, 1))))
    const chunks: number[][] = []
    for (let i = 0; i < months.length; i += perChunk) chunks.push(months.map((_, j) => j).slice(i, i + perChunk))
    return (
        <View>
            {chunks.map((idx, ci) => {
                const rows: { cells: string[]; tones?: (Tone | undefined)[] }[] = []
                for (const a of accounts) {
                    const ms = a.months ?? []
                    const name = a.deactivated ? `${a.nickname} (deakt.)` : a.nickname
                    rows.push({
                        cells: [name, 'Einzahlung', ...idx.map(j => (ms[j]?.payments ? reportEuro(ms[j].payments) : '–'))],
                        tones: [undefined, 'muted', ...idx.map(j => (ms[j]?.payments ? 'pos' as Tone : 'muted' as Tone))],
                    })
                    rows.push({
                        cells: ['', 'Schulden', ...idx.map(j => (ms[j]?.penalties ? reportEuro(ms[j].penalties) : '–'))],
                        tones: [undefined, 'muted', ...idx.map(j => (ms[j]?.penalties ? 'neg' as Tone : 'muted' as Tone))],
                    })
                    rows.push({
                        cells: ['', 'Saldo', ...idx.map(j => (ms[j] ? reportSigned(ms[j].balance) : ''))],
                        tones: [undefined, 'muted', ...idx.map(j => (ms[j] ? signTone(ms[j].balance) : undefined))],
                    })
                }
                const cols: Col[] = [
                    {w: nameW, head: 'Konto'}, {w: kindW, head: ''},
                    ...idx.map(j => ({w: monthW, head: months[j], align: 'right' as const})),
                ]
                return (
                    <View key={ci} style={{marginTop: ci ? 12 : 0}}>
                        <DataTable cols={cols} tint={tint} rows={rows}/>
                    </View>
                )
            })}
        </View>
    )
}

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/** Bookings (already date-sorted, "dd.mm.yyyy") with a heading row per month carrying the cash net. */
export function bookingsByMonth(bookings: ReportData['bookings']) {
    const rows: { cells: string[]; tones?: (Tone | undefined)[]; bold?: boolean }[] = []
    let current = ''
    for (const b of bookings) {
        const [, mm, yyyy] = b.date.split('.')
        const key = `${yyyy}-${mm}`
        if (key !== current) {
            current = key
            const inMonth = bookings.filter(x => x.date.split('.').slice(1).reverse().join('-') === key)
            // Write-offs settle a balance without any cash moving, so they stay out of the monthly net.
            const net = inMonth.filter(x => x.type !== 'Abschreibung').reduce((a, x) => a + x.amount, 0)
            const label = MONTHS_DE[Number(mm) - 1] ? `${MONTHS_DE[Number(mm) - 1]} ${yyyy}` : b.date
            rows.push({cells: ['', '', label, reportSigned(net), ''], tones: [undefined, undefined, undefined, signTone(net), undefined], bold: true})
        }
        rows.push({cells: [b.date, b.type, b.description, reportSigned(b.amount), b.note], tones: [undefined, undefined, undefined, b.type === 'Abschreibung' ? 'muted' : signTone(b.amount), 'muted']})
    }
    return rows
}

/** Penalties per person × type. Columns ordered by total (most costly type first). */
export function penaltyMatrix(rows: ReportData['penalties_by_person']) {
    const typeTotal = new Map<string, number>()
    const people = new Map<string, Map<string, number>>()
    for (const r of rows) {
        const t = r.type || 'Sonstige'
        typeTotal.set(t, (typeTotal.get(t) ?? 0) + r.total)
        const m = people.get(r.nickname) ?? new Map<string, number>()
        m.set(t, (m.get(t) ?? 0) + r.total)
        people.set(r.nickname, m)
    }
    const types = [...typeTotal.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
    // Per type: the costliest and cheapest non-zero cell (only meaningful with ≥ 2 distinct values).
    const extremes = new Map<string, { max: number; min: number } | null>()
    for (const t of types) {
        const vals = [...people.values()].map(m => m.get(t) ?? 0).filter(v => v > 0)
        const max = Math.max(...vals), min = Math.min(...vals)
        extremes.set(t, vals.length >= 2 && max !== min ? {max, min} : null)
    }
    return {
        types,
        extremes,
        people: [...people.entries()].map(([name, m]) => ({
            name,
            values: types.map(t => m.get(t) ?? 0),
            total: [...m.values()].reduce((a, v) => a + v, 0),
        })),
    }
}

function PenaltyMatrix({rows, tint}: { rows: ReportData['penalties_by_person']; tint: string }) {
    const {types, extremes, people} = penaltyMatrix(rows)
    if (!people.length) return null
    const nameW = 90, sumW = 56, perChunk = 11
    const chunks: string[][] = []
    for (let i = 0; i < types.length; i += perChunk) chunks.push(types.slice(i, i + perChunk))
    const typeW = Math.min(64, Math.floor((LANDSCAPE_W - nameW - sumW) / Math.min(perChunk, Math.max(types.length, 1))))
    return (
        <View>
            {chunks.map((chunk, ci) => (
                <View key={ci} style={{marginTop: ci ? 12 : 0}}>
                    <DataTable
                        tint={tint}
                        cols={[
                            {w: nameW, head: 'Kegelname'},
                            {w: sumW, head: 'Summe', align: 'right'},
                            ...chunk.map(t => ({w: typeW, head: t, align: 'right' as const})),
                        ]}
                        rows={people.map(p => {
                            const cells = chunk.map(t => p.values[types.indexOf(t)])
                            return {
                                cells: [p.name, reportNumber(p.total), ...cells.map(v => (v ? reportNumber(v) : '–'))],
                                tones: [undefined, undefined, ...chunk.map((t, i) => {
                                    const ex = extremes.get(t)
                                    if (!ex || !cells[i]) return cells[i] ? undefined : 'muted' as Tone
                                    return cells[i] === ex.max ? 'neg' as Tone : cells[i] === ex.min ? 'pos' as Tone : undefined
                                })],
                                bold: [false, true, ...chunk.map((t, i) => {
                                    const ex = extremes.get(t)
                                    return !!ex && (cells[i] === ex.max || cells[i] === ex.min)
                                })],
                            }
                        })}
                    />
                </View>
            ))}
            <Text style={{fontFamily: 'Helvetica', fontSize: 8, color: MUTED, marginTop: 6}}>
                Beträge in €. Rot = höchster, grün = niedrigster Wert je Strafenart (nur wenn mindestens zwei Personen sie hatten).
            </Text>
        </View>
    )
}

function KpiTile({label, value, tone}: { label: string; value: string; tone?: Tone }) {
    return (
        <View style={{flexGrow: 1, flexBasis: 0, borderWidth: 0.75, borderColor: '#e4e4e7', borderRadius: 6, padding: 8, backgroundColor: '#fafafa'}}>
            <Text style={{fontFamily: 'Helvetica', fontSize: 8, color: MUTED}}>{label}</Text>
            <Text style={{fontFamily: 'Helvetica', fontSize: 14, fontWeight: 700, color: toneColor(tone, '#18181b')}}>{value}</Text>
        </View>
    )
}

export function ReportDocument({data: raw, branding}: { data: ReportData; branding?: ReportBranding }) {
    const data = sanitize(raw)
    const s = data.summary
    const base = branding?.color && /^#[0-9a-f]{6}$/i.test(branding.color) ? branding.color : DEFAULT_ACCENT
    const accent = ensureContrast(base, WHITE) // brand colour as text on white paper
    const bandText = readableOn(base, '#18181b', WHITE)
    const tint = mixOver(base, WHITE, 14)
    const accountTotals = data.accounts.reduce(
        (a, r) => ({pen: a.pen + r.penalties, pay: a.pay + r.payments}),
        {pen: 0, pay: 0},
    )
    const accountBalance = accountTotals.pay - accountTotals.pen
    const logo = branding?.logo
    const logoH = 44
    const initial = (data.club_name.trim()[0] ?? 'K').toUpperCase()
    // Fixed footer on every page: club + period on the left of a centred page number.
    const footer = (
        <Fixed position="footer">
            <Text style={{fontFamily: 'Helvetica', fontSize: 8, color: MUTED, textAlign: 'center'}}>
                {`${data.club_name} · Kassenbericht ${data.period_label}`}
            </Text>
            <PageNumber format="Seite {page} von {total}" align="center"/>
        </Fixed>
    )
    const w = (shares: (number | 'rest')[]) => fill(PORTRAIT_W, shares)

    const accountCols = w([80, 'rest', 58, 58, 62, 62])
    const openCols = w([110, 'rest', 70, 70, 76])
    // open penalties = unpaid share of a member's penalties (negative balance)
    const openOf = (a: { balance: number }) => Math.max(0, Math.round(-a.balance * 100) / 100)
    const openRows = data.accounts.filter(a => openOf(a) > 0).sort((a, b) => openOf(b) - openOf(a))
    const openTotal = openRows.reduce((sum, a) => sum + openOf(a), 0)
    // Guests' open penalties are listed too (marked as guests), but stay out of the member accounts total.
    const guestOpenRows = data.monthly.guests
        .filter(g => openOf(g) > 0)
        .map(g => ({nickname: g.name, name: 'Gast', penalties: g.penalties, payments: g.payments, balance: g.balance, deactivated: false}))
    const allOpenRows = [...openRows, ...guestOpenRows].sort((a, b) => openOf(b) - openOf(a))
    const allOpenTotal = openTotal + guestOpenRows.reduce((sum, a) => sum + openOf(a), 0)
    const evCols = w([62, 'rest', 58, 46, 46, 62, 86])
    const bookCols = w([64, 62, 'rest', 74, 'rest'])
    // two `rest` columns share the remainder: description ≈ 45 %, note ≈ 55 %
    const bookRest = bookCols[2]
    const bookW = [bookCols[0], bookCols[1], Math.round(bookRest * 0.45), bookCols[3], bookRest - Math.round(bookRest * 0.45)]

    return (
        <PdfcnThemeProvider>
            <Document title={`Kassenbericht – ${data.club_name}`} author={data.club_name} lang="de-DE">
                <Page size="A4" margin={MARGIN}>
                    {footer}
                    <View style={{
                        flexDirection: 'row', alignItems: 'center', backgroundColor: base, borderRadius: 8,
                        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 6,
                    }}>
                        {logo ? (
                            <Image src={logo.src} height={logoH} width={Math.round(logoH * logo.width / logo.height)}
                                   style={{marginRight: 14}}/>
                        ) : (
                            <View style={{
                                width: 44, height: 44, borderRadius: 22, backgroundColor: bandText, marginRight: 14,
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Text style={{fontFamily: 'Helvetica', fontSize: 22, fontWeight: 700, color: base}}>{initial}</Text>
                            </View>
                        )}
                        <View style={{flexGrow: 1, flexBasis: 0}}>
                            <Text style={{fontFamily: 'Helvetica', fontSize: 20, fontWeight: 700, color: bandText}}>
                                Kassenbericht
                            </Text>
                            <Text style={{fontFamily: 'Helvetica', fontSize: 11, color: bandText}}>
                                {`${data.club_name} · ${data.period_label}`}
                            </Text>
                        </View>
                        <Text style={{fontFamily: 'Helvetica', fontSize: 8, color: bandText, textAlign: 'right'}}>
                            {`Erstellt am ${data.generated_at}`}
                        </Text>
                    </View>

                    <Section title="Zusammenfassung" accent={accent}>
                        <View style={{flexDirection: 'row', gap: 8, marginBottom: 8}}>
                            <KpiTile label="Kassenstand" value={reportEuro(s.kassenstand)} tone={signTone(s.kassenstand)}/>
                            <KpiTile label="Einzahlungen" value={reportEuro(s.total_payments)}/>
                            <KpiTile label="Strafen" value={reportEuro(s.total_penalties)}/>
                            <KpiTile label="Ausgaben" value={reportEuro(s.total_expenses)}/>
                        </View>
                        <Text style={{fontFamily: 'Helvetica', fontSize: 9, color: MUTED}}>
                            {`${s.evenings} Abende · ${s.members} aktive Mitglieder`}
                        </Text>
                    </Section>

                    <Section title="Mitglieder-Konten" accent={accent}>
                        <DataTable
                            tint={tint}
                            cols={[
                                {w: accountCols[0], head: 'Kegelname'},
                                {w: accountCols[1], head: 'Name'},
                                {w: accountCols[2], head: 'Strafen', align: 'right'},
                                {w: accountCols[3], head: 'Einzahl.', align: 'right'},
                                {w: accountCols[4], head: 'Saldo', align: 'right'},
                                {w: accountCols[5], head: 'Offen', align: 'right'},
                            ]}
                            rows={data.accounts.map(a => ({
                                cells: [
                                    a.nickname, a.deactivated ? `${a.name} (deaktiviert)` : a.name,
                                    reportEuro(a.penalties), reportEuro(a.payments), reportSigned(a.balance),
                                    openOf(a) > 0 ? reportEuro(openOf(a)) : '–',
                                ],
                                tones: [undefined, a.deactivated ? 'muted' : undefined, undefined, undefined, signTone(a.balance),
                                    openOf(a) > 0 ? 'neg' : 'muted'],
                            }))}
                            footer={{
                                cells: ['GESAMT', '', reportEuro(accountTotals.pen), reportEuro(accountTotals.pay), reportSigned(accountBalance),
                                    openTotal > 0 ? reportEuro(openTotal) : '–'],
                                tones: [undefined, undefined, undefined, undefined, signTone(accountBalance),
                                    openTotal > 0 ? 'neg' : 'muted'],
                            }}
                        />
                    </Section>

                    {allOpenRows.length > 0 && (
                        <Section title="Offene Strafen" accent={accent}>
                            <DataTable
                                tint={tint}
                                cols={[
                                    {w: openCols[0], head: 'Kegelname'},
                                    {w: openCols[1], head: 'Name'},
                                    {w: openCols[2], head: 'Strafen', align: 'right'},
                                    {w: openCols[3], head: 'Bezahlt', align: 'right'},
                                    {w: openCols[4], head: 'Offen', align: 'right'},
                                ]}
                                rows={allOpenRows.map(a => ({
                                    cells: [a.nickname, a.deactivated ? `${a.name} (deaktiviert)` : a.name,
                                        reportEuro(a.penalties), reportEuro(a.payments), reportEuro(openOf(a))],
                                    tones: [undefined, a.deactivated ? 'muted' : undefined, undefined, undefined, 'neg'],
                                }))}
                                footer={{
                                    cells: ['GESAMT', '', '', '', reportEuro(allOpenTotal)],
                                    tones: [undefined, undefined, undefined, undefined, 'neg'],
                                }}
                            />
                        </Section>
                    )}
                </Page>

                <Page size="A4" margin={MARGIN}>
                    {footer}
                    <Section title="Buchungen" accent={accent}>
                        <DataTable
                            tint={tint}
                            cols={[
                                {w: bookW[0], head: 'Datum'},
                                {w: bookW[1], head: 'Typ'},
                                {w: bookW[2], head: 'Mitglied / Beschreibung'},
                                {w: bookW[3], head: 'Betrag', align: 'right'},
                                {w: bookW[4], head: 'Notiz'},
                            ]}
                            rows={bookingsByMonth(data.bookings)}
                        />
                    </Section>
                </Page>

                {data.penalties_by_person.length > 0 && (
                    <Page size={LANDSCAPE} margin={MARGIN}>
                        {footer}
                        <Section title="Strafen nach Person" accent={accent}>
                            <PenaltyMatrix rows={data.penalties_by_person} tint={tint}/>
                        </Section>
                    </Page>
                )}

                <Page size="A4" margin={MARGIN}>
                    {footer}
                    <Section title="Abende" accent={accent}>
                        <DataTable
                            tint={tint}
                            cols={[
                                {w: evCols[0], head: 'Datum'},
                                {w: evCols[1], head: 'Ort'},
                                {w: evCols[2], head: 'Status'},
                                {w: evCols[3], head: 'Spieler', align: 'right'},
                                {w: evCols[4], head: 'Spiele', align: 'right'},
                                {w: evCols[5], head: 'Strafen', align: 'right'},
                                {w: evCols[6], head: 'König'},
                            ]}
                            rows={data.evenings.map(e => ({
                                cells: [
                                    e.date, e.venue, e.closed ? 'Archiviert' : 'Offen', String(e.players), String(e.games),
                                    reportEuro(e.penalties), e.king,
                                ],
                            }))}
                        />
                    </Section>
                </Page>

                {data.monthly.months.length > 0 && (
                    <Page size={LANDSCAPE} margin={MARGIN}>
                        {footer}
                        <Section title="Monatsübersicht" accent={accent}>
                            {data.monthly.regular.length > 0 && (
                                <View>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: 9, color: MUTED, marginBottom: 3}}>
                                        Stammspieler (Beträge in €)
                                    </Text>
                                    <MonthlyTable months={data.monthly.months} rows={data.monthly.regular} tint={tint}/>
                                </View>
                            )}
                            {data.monthly.guests.length > 0 && (
                                <View style={{marginTop: 12}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: 9, color: MUTED, marginBottom: 3}}>
                                        {data.monthly.guest_penalty_cap != null
                                            ? `Gäste (Beträge in €, Strafen pro Abend auf ${reportEuro(data.monthly.guest_penalty_cap)} gedeckelt)`
                                            : 'Gäste (Beträge in €)'}
                                    </Text>
                                    <MonthlyTable months={data.monthly.months} rows={data.monthly.guests} tint={tint}/>
                                </View>
                            )}
                        </Section>
                    </Page>
                )}
                {data.accounts.some(a => (a.months?.length ?? 0) > 0) && (
                    <Page size={LANDSCAPE} margin={MARGIN}>
                        {footer}
                        <Section title="Konten pro Monat" accent={accent}>
                            <Text style={{fontFamily: 'Helvetica', fontSize: 9, color: MUTED, marginBottom: 3}}>
                                Einzahlung, Schulden und Saldo (kumuliert) am Monatsende
                            </Text>
                            <AccountMonthsTable accounts={data.accounts} tint={tint}/>
                        </Section>
                    </Page>
                )}
            </Document>
        </PdfcnThemeProvider>
    )
}

/** Render the report to PDF bytes. The Forme WASM engine is imported on demand. */
export async function renderReportPdf(data: ReportData, branding?: ReportBranding): Promise<Uint8Array> {
    const {renderDocument} = await import('@formepdf/core')
    return renderDocument(<ReportDocument data={data} branding={branding}/>)
}
