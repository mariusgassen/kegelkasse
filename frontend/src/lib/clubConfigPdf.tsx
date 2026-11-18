/**
 * Vereins-Einstellungen als PDF — built in the browser from the existing admin-only
 * `GET /club/config/export` bundle, with the same pdfcn/Forme stack as the Kassenbericht.
 * Loaded lazily by `api.downloadClubConfigPdf`, so the WASM engine never hits the main bundle.
 * Penalty types lead the document; the rest of the club setup follows. No secrets/member data.
 */
import type {ReactNode} from 'react'
import {Document, Page} from '@formepdf/react'
import {Fixed, Image, Text, View} from '@/lib/pdf-primitives'
import {ensureContrast, mixOver, readableOn} from '@/lib/contrast'
import {PageNumber} from '@/components/pdf/page-number/page-number'
import {Table, TableBody, TableCell, TableHeader, TableRow} from '@/components/pdf/table/table'
import {PdfcnThemeProvider} from '@/components/pdf/theme-provider'
import {pdfText, reportEuro, type ReportBranding} from '@/lib/reportPdf'
import {de} from '@/i18n/de'
import type {ClubConfigBundle, ClubConfigGameTemplate} from '@/types'

const DEFAULT_ACCENT = '#2f5d3a'
const WHITE = '#ffffff'
const MUTED = '#71717a'
const PORTRAIT_W = 523 // A4 (595pt) minus 2 × 36pt margin
const MARGIN = 36
const FONT = 9
const HEAD_FONT = 8.5

/** "–" for unset amounts, otherwise the same Euro format as the Kassenbericht. */
export function configEuro(v: number | null | undefined): string {
    return v == null ? '–' : reportEuro(v)
}

/** Sound presets are stored as keys; the PDF uses their German UI labels (no emoji font). */
export function soundLabel(key: string | null | undefined): string {
    if (!key) return '–'
    const label = de[`sound.preset.${key}` as keyof typeof de]
    return pdfText(label ?? key) || '–'
}

/** Club toggles default to on for older clubs that never saved the setting. */
export function yesNo(v: boolean | null | undefined, fallback: boolean): string {
    return (v ?? fallback) ? 'Ja' : 'Nein'
}

/** Winner type + turn mode as one compact cell ("Team · Block"). */
export function templateMode(gt: ClubConfigGameTemplate): string {
    const winner = gt.winner_type === 'team' ? 'Team' : gt.winner_type === 'individual' ? 'Einzel' : 'Beide'
    const turn = gt.turn_mode === 'block' ? 'Block'
        : gt.turn_mode === 'alternating' ? 'Wechselnd' : null
    return turn ? `${winner} · ${turn}` : winner
}

/** "Eröffnung, Präsident" — empty when neither flag is set. */
export function templateFlags(gt: ClubConfigGameTemplate): string {
    return [gt.is_opener && 'Eröffnung', gt.is_president_game && 'Präsident'].filter(Boolean).join(', ')
}

export function configExportedAt(iso: string | null | undefined): string {
    const d = iso ? new Date(iso) : new Date()
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
}

/** Strip emoji recursively — Helvetica has no glyphs for them, but keeps names/umlauts intact. */
function sanitize<T>(v: T): T {
    if (typeof v === 'string') return pdfText(v) as T
    if (Array.isArray(v)) return v.map(sanitize) as T
    if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)])) as T
    }
    return v
}

interface Col {
    w: number
    head: string
    align?: 'left' | 'right'
}

function Cell({w, align, children, header}: { w: number; align?: 'left' | 'right'; children: ReactNode; header?: boolean }) {
    return (
        <TableCell width={w} align={align} header={header} style={{paddingHorizontal: 5, paddingVertical: 4}}>
            <Text style={{
                fontFamily: 'Helvetica', fontSize: header ? HEAD_FONT : FONT,
                fontWeight: header ? 700 : 400,
                color: header ? MUTED : '#18181b',
                textAlign: align ?? 'left',
            }}>{children}</Text>
        </TableCell>
    )
}

function DataTable({cols, rows, tint}: { cols: Col[]; rows: string[][]; tint: string }) {
    return (
        <Table variant="line" zebraStripe>
            <TableHeader>
                <TableRow header style={{backgroundColor: tint}}>
                    {cols.map((c, i) => <Cell key={i} w={c.w} align={c.align} header>{c.head}</Cell>)}
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((cells, ri) => (
                    <TableRow key={ri}>
                        {cells.map((c, i) => <Cell key={i} w={cols[i].w} align={cols[i].align}>{c}</Cell>)}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
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

function Empty({children}: { children: ReactNode }) {
    return <Text style={{fontFamily: 'Helvetica', fontSize: 9, color: MUTED}}>{children}</Text>
}

export function ClubConfigDocument({data: raw, branding}: { data: ClubConfigBundle; branding?: ReportBranding }) {
    const data = sanitize(raw)
    const s = data.settings
    const base = branding?.color && /^#[0-9a-f]{6}$/i.test(branding.color) ? branding.color : DEFAULT_ACCENT
    const accent = ensureContrast(base, WHITE)
    const bandText = readableOn(base, '#18181b', WHITE)
    const tint = mixOver(base, WHITE, 14)
    const clubName = data.club_name || 'Kegelclub'
    const logo = branding?.logo
    const logoH = 44
    const initial = clubName.trim()[0]?.toUpperCase() || 'K'
    const generated = configExportedAt(data.exported_at)

    const footer = (
        <Fixed position="footer">
            <Text style={{fontFamily: 'Helvetica', fontSize: 8, color: MUTED, textAlign: 'center'}}>
                {`${clubName} · Vereinseinstellungen`}
            </Text>
            <PageNumber format="Seite {page} von {total}" align="center"/>
        </Fixed>
    )

    const penaltyRows = data.penalty_types.map(pt => [
        pt.name, configEuro(pt.default_amount), soundLabel(pt.sound_key),
    ])
    const settingRows: string[][] = [
        ['Spiellokal', s.home_venue || '–'],
        ['Primärfarbe', s.primary_color || '–'],
        ['Sekundärfarbe', s.secondary_color || '–'],
        ['Hintergrundfarbe', s.bg_color || '–'],
        ['Gästestrafen-Limit', configEuro(s.guest_penalty_cap)],
        ['Keine-Absage-Gebühr', configEuro(s.no_cancel_fee)],
        ['Nadel-Strafe', configEuro(s.pin_penalty)],
        ['Standard-Startzeit', s.default_evening_time || '–'],
        ['Wurf-Erfassung', yesNo(s.throw_tracking_enabled, true)],
        ['Audio-Ansagen', yesNo(s.audio_callouts_enabled, true)],
    ]
    const templateRows = data.game_templates.map(gt => {
        const flags = templateFlags(gt)
        return [
            flags ? `${gt.name} (${flags})` : gt.name,
            templateMode(gt),
            gt.description || '–',
            configEuro(gt.default_loser_penalty),
            configEuro(gt.per_point_penalty),
        ]
    })

    return (
        <PdfcnThemeProvider>
            <Document title={`Vereinseinstellungen – ${clubName}`} author={clubName} lang="de-DE">
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
                                Vereinseinstellungen
                            </Text>
                            <Text style={{fontFamily: 'Helvetica', fontSize: 11, color: bandText}}>{clubName}</Text>
                        </View>
                        <Text style={{fontFamily: 'Helvetica', fontSize: 8, color: bandText, textAlign: 'right'}}>
                            {generated ? `Erstellt am ${generated}` : ''}
                        </Text>
                    </View>

                    <Section title="Strafenarten" accent={accent}>
                        {penaltyRows.length ? (
                            <DataTable
                                tint={tint}
                                cols={[
                                    {w: 280, head: 'Strafenart'},
                                    {w: 100, head: 'Betrag', align: 'right'},
                                    {w: 143, head: 'Ton'},
                                ]}
                                rows={penaltyRows}
                            />
                        ) : <Empty>Keine Strafenarten hinterlegt.</Empty>}
                    </Section>

                    <Section title="Grundeinstellungen" accent={accent}>
                        <DataTable
                            tint={tint}
                            cols={[{w: 190, head: 'Einstellung'}, {w: 333, head: 'Wert'}]}
                            rows={settingRows}
                        />
                    </Section>
                </Page>

                <Page size="A4" margin={MARGIN}>
                    {footer}
                    <Section title="Spielvorlagen" accent={accent}>
                        {templateRows.length ? (
                            <DataTable
                                tint={tint}
                                cols={[
                                    {w: 120, head: 'Vorlage'},
                                    {w: 80, head: 'Modus'},
                                    {w: 143, head: 'Kommentar'},
                                    {w: 100, head: 'Verliererstrafe', align: 'right'},
                                    {w: 80, head: 'pro Punkt', align: 'right'},
                                ]}
                                rows={templateRows}
                            />
                        ) : <Empty>Keine Spielvorlagen hinterlegt.</Empty>}
                    </Section>

                    <View style={{flexDirection: 'row', gap: 14, marginTop: 10}}>
                        <View style={{flexGrow: 1, flexBasis: 0}}>
                            <Section title="Teams" accent={accent}>
                                {data.teams.length ? (
                                    <DataTable tint={tint} cols={[{w: 254, head: 'Team'}]}
                                               rows={data.teams.map(tm => [tm.name])}/>
                                ) : <Empty>Keine Teams hinterlegt.</Empty>}
                            </Section>
                        </View>
                        <View style={{flexGrow: 1, flexBasis: 0}}>
                            <Section title="Vereinsnadeln" accent={accent}>
                                {data.pins.length ? (
                                    <DataTable tint={tint} cols={[{w: 254, head: 'Nadel'}]}
                                               rows={data.pins.map(pin => [pin.name])}/>
                                ) : <Empty>Keine Nadeln hinterlegt.</Empty>}
                            </Section>
                        </View>
                    </View>
                </Page>
            </Document>
        </PdfcnThemeProvider>
    )
}

/** Render the club config to PDF bytes. The Forme WASM engine is imported on demand. */
export async function renderClubConfigPdf(data: ClubConfigBundle, branding?: ReportBranding): Promise<Uint8Array> {
    const {renderDocument} = await import('@formepdf/core')
    return renderDocument(<ClubConfigDocument data={data} branding={branding}/>)
}
