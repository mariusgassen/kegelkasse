/**
 * Kassenbericht PDF — built in the browser from `GET /reports/data` with the pdfcn components
 * (Forme renderer). Loaded lazily by `api.downloadReport`, so the WASM engine never touches the
 * main bundle. The Excel export stays server-side.
 */
import type {ReactNode} from 'react'
import {Document, Page} from '@formepdf/react'
import {Fixed, Text, View} from '@/lib/pdf-primitives'
import {Heading} from '@/components/pdf/heading/heading'
import {KeyValue} from '@/components/pdf/key-value/key-value'
import {PageNumber} from '@/components/pdf/page-number/page-number'
import {Table, TableBody, TableCell, TableFooter, TableHeader, TableRow} from '@/components/pdf/table/table'
import {PdfcnThemeProvider} from '@/components/pdf/theme-provider'
import type {ReportData, ReportMonthlyRow} from '@/types'

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

function Section({title, children}: { title: string; children: ReactNode }) {
    return (
        <View>
            <Heading level={3} keepWithNext>{title}</Heading>
            {children}
        </View>
    )
}

function Cell({w, align, children, header, footer}: {
    w: number; align?: 'left' | 'right'; children: ReactNode; header?: boolean; footer?: boolean
}) {
    return <TableCell width={w} align={align} header={header} footer={footer}>{children}</TableCell>
}

/** Column widths are a share of the page width, so every table fills the page exactly. */
const cols = (total: number, shares: number[]) => {
    const sum = shares.reduce((a, b) => a + b, 0)
    return shares.map(s => Math.floor((total * s) / sum))
}

function DataTable({widths, head, rows, aligns, footer}: {
    widths: number[]
    head: string[]
    rows: string[][]
    aligns: ('left' | 'right')[]
    footer?: string[]
}) {
    return (
        <Table variant="line" zebraStripe>
            <TableHeader>
                <TableRow header>
                    {head.map((h, i) => <Cell key={i} w={widths[i]} align={aligns[i]} header>{h}</Cell>)}
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r, ri) => (
                    <TableRow key={ri}>
                        {r.map((c, i) => <Cell key={i} w={widths[i]} align={aligns[i]}>{c}</Cell>)}
                    </TableRow>
                ))}
            </TableBody>
            {footer && (
                <TableFooter>
                    <TableRow footer>
                        {footer.map((c, i) => <Cell key={i} w={widths[i]} align={aligns[i]} footer>{c}</Cell>)}
                    </TableRow>
                </TableFooter>
            )}
        </Table>
    )
}

function MonthlyTable({months, rows}: { months: string[]; rows: ReportMonthlyRow[] }) {
    const fixed = 58
    const nameW = 84
    const monthW = Math.max(30, Math.floor((LANDSCAPE_W - nameW - fixed * 3) / Math.max(months.length, 1)))
    return (
        <Table variant="line" zebraStripe>
            <TableHeader>
                <TableRow header>
                    <Cell w={nameW} header>Spieler</Cell>
                    {months.map(m => <Cell key={m} w={monthW} align="right" header>{m}</Cell>)}
                    <Cell w={fixed} align="right" header>Strafen</Cell>
                    <Cell w={fixed} align="right" header>Einz.</Cell>
                    <Cell w={fixed} align="right" header>Saldo</Cell>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((r, i) => (
                    <TableRow key={i}>
                        <Cell w={nameW}>{r.name}</Cell>
                        {r.months.map((v, mi) => (
                            <Cell key={mi} w={monthW} align="right">{v ? reportNumber(v) : ''}</Cell>
                        ))}
                        <Cell w={fixed} align="right">{reportNumber(r.penalties)}</Cell>
                        <Cell w={fixed} align="right">{reportNumber(r.payments)}</Cell>
                        <Cell w={fixed} align="right">{reportNumber(r.balance)}</Cell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

export function ReportDocument({data}: { data: ReportData }) {
    const s = data.summary
    const accountTotals = data.accounts.reduce(
        (a, r) => ({pen: a.pen + r.penalties, pay: a.pay + r.payments}),
        {pen: 0, pay: 0},
    )
    // PageNumber has no `fixed` behaviour of its own: pin it to the footer of every page.
    const pageNumber = (
        <Fixed position="footer">
            <PageNumber format="Seite {page} von {total}" align="center"/>
        </Fixed>
    )

    return (
        <PdfcnThemeProvider>
            <Document title={`Kassenbericht – ${data.club_name}`} author={data.club_name} lang="de-DE">
                <Page size="A4" margin={MARGIN}>
                    {pageNumber}
                    <Heading level={1}>{`Kassenbericht – ${data.club_name}`}</Heading>
                    <KeyValue
                        items={[
                            {key: 'Zeitraum', value: data.period_label},
                            {key: 'Erstellt am', value: data.generated_at},
                        ]}
                    />
                    <Section title="Zusammenfassung">
                        <KeyValue
                            divided
                            boldValue
                            items={[
                                {key: 'Strafen (gesamt)', value: reportEuro(s.total_penalties)},
                                {key: 'Einzahlungen (gesamt)', value: reportEuro(s.total_payments)},
                                {key: 'Ausgaben (gesamt)', value: reportEuro(s.total_expenses)},
                                {key: 'Kassenstand', value: reportEuro(s.kassenstand)},
                                {key: 'Abende', value: String(s.evenings)},
                                {key: 'Mitglieder (aktiv)', value: String(s.members)},
                            ]}
                        />
                    </Section>
                    <Section title="Mitglieder-Konten">
                        <DataTable
                            widths={cols(PORTRAIT_W, [3, 3.4, 2, 2, 2])}
                            head={['Kegelname', 'Name', 'Strafen', 'Einzahl.', 'Saldo']}
                            aligns={['left', 'left', 'right', 'right', 'right']}
                            rows={data.accounts.map(a => [
                                a.nickname, a.name, reportEuro(a.penalties), reportEuro(a.payments), reportEuro(a.balance),
                            ])}
                            footer={[
                                'GESAMT', '', reportEuro(accountTotals.pen), reportEuro(accountTotals.pay),
                                reportEuro(accountTotals.pay - accountTotals.pen),
                            ]}
                        />
                    </Section>
                </Page>

                <Page size="A4" margin={MARGIN}>
                    {pageNumber}
                    <Section title="Buchungen">
                        <DataTable
                            widths={cols(PORTRAIT_W, [1.6, 1.6, 5, 2.2, 3])}
                            head={['Datum', 'Typ', 'Mitglied / Beschreibung', 'Betrag', 'Notiz']}
                            aligns={['left', 'left', 'left', 'right', 'left']}
                            rows={data.bookings.map(b => [
                                b.date, b.type, b.description, `${reportEuro(Math.abs(b.amount))}${b.amount >= 0 ? ' +' : ' -'}`, b.note,
                            ])}
                        />
                    </Section>
                </Page>

                <Page size="A4" margin={MARGIN}>
                    {pageNumber}
                    <Section title="Strafen nach Person">
                        <DataTable
                            widths={cols(PORTRAIT_W, [3, 5, 1.2, 2.2])}
                            head={['Kegelname', 'Strafen-Typ', 'Anz.', 'Betrag']}
                            aligns={['left', 'left', 'right', 'right']}
                            rows={data.penalties_by_person.map(p => [p.nickname, p.type, String(p.count), reportEuro(p.total)])}
                        />
                    </Section>
                </Page>

                <Page size="A4" margin={MARGIN}>
                    {pageNumber}
                    <Section title="Abende">
                        <DataTable
                            widths={cols(PORTRAIT_W, [1.7, 3.2, 1.7, 1.3, 1.3, 2, 2.2])}
                            head={['Datum', 'Ort', 'Status', 'Spieler', 'Spiele', 'Strafen', 'König']}
                            aligns={['left', 'left', 'left', 'right', 'right', 'right', 'left']}
                            rows={data.evenings.map(e => [
                                e.date, e.venue, e.closed ? 'Archiviert' : 'Offen', String(e.players), String(e.games),
                                reportEuro(e.penalties), e.king,
                            ])}
                        />
                    </Section>
                </Page>

                {data.monthly.months.length > 0 && (
                    <Page size={LANDSCAPE} margin={MARGIN}>
                    {pageNumber}
                        <Section title="Monatsübersicht">
                            {data.monthly.regular.length > 0 && (
                                <View>
                                    <Text>Stammspieler (Beträge in €)</Text>
                                    <MonthlyTable months={data.monthly.months} rows={data.monthly.regular}/>
                                </View>
                            )}
                            {data.monthly.guests.length > 0 && (
                                <View>
                                    <Text>Gäste (Beträge in €)</Text>
                                    <MonthlyTable months={data.monthly.months} rows={data.monthly.guests}/>
                                </View>
                            )}
                        </Section>
                    </Page>
                )}
            </Document>
        </PdfcnThemeProvider>
    )
}

/** Render the report to PDF bytes. The Forme WASM engine is imported on demand. */
export async function renderReportPdf(data: ReportData): Promise<Uint8Array> {
    const {renderDocument} = await import('@formepdf/core')
    return renderDocument(<ReportDocument data={data}/>)
}
