// @vitest-environment node
import {describe, expect, it} from 'vitest'
import {renderReportPdf, reportEuro} from '../reportPdf'
import type {ReportData} from '@/types'

const row = (name: string) => ({name, months: [2.5, 0], penalties: 2.5, payments: 0, balance: -2.5})

const DATA: ReportData = {
    club_name: 'KC Müller & Söhne',
    period_label: '2025',
    generated_at: '01.04.2025 20:00',
    summary: {total_penalties: 2.5, total_payments: 10, total_expenses: 1, kassenstand: 6.5, evenings: 1, members: 1},
    accounts: [{nickname: 'Dati', name: 'Data Member', penalties: 2.5, payments: 0, balance: -2.5}],
    bookings: [{date: '01.03.2025', type: 'Einzahlung', description: 'Dati', amount: 10, note: 'Mitgliedsbeitrag'}],
    penalties_by_person: [{nickname: 'Dati', type: 'Strafe', count: 1, total: 2.5}],
    evenings: [{date: '01.03.2025', venue: 'Bahn 1', closed: true, players: 8, games: 3, penalties: 2.5, king: 'Dati'}],
    monthly: {months: ['Mrz', 'Apr'], regular: [row('Dati')], guests: [row('Gast')]},
}

describe('reportEuro', () => {
    it('formats like the Excel export, with a plain space before the euro sign', () => {
        expect(reportEuro(1234.5)).toBe('1.234,50 €')
        expect(reportEuro(-2.5)).toBe('-2,50 €')
    })
})

describe('renderReportPdf', () => {
    it('renders a PDF with the report content', async () => {
        const bytes = await renderReportPdf(DATA)
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
        expect(bytes.length).toBeGreaterThan(2000)
    })

    it('renders an empty report (no bookings, no months) without throwing', async () => {
        const empty: ReportData = {
            ...DATA, accounts: [], bookings: [], penalties_by_person: [], evenings: [],
            monthly: {months: [], regular: [], guests: []},
        }
        const bytes = await renderReportPdf(empty)
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    })
})
