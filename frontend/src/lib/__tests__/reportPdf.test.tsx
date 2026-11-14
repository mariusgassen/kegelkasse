// @vitest-environment node
import {describe, expect, it} from 'vitest'
import {bookingsByMonth, penaltyMatrix, pdfText, renderReportPdf, reportEuro, reportSigned} from '../reportPdf'
import {scaleToFit} from '../reportBranding'
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

describe('reportSigned', () => {
    it('puts the sign before the amount', () => {
        expect(reportSigned(12.5)).toBe('+12,50 €')
        expect(reportSigned(-12.5)).toBe('-12,50 €')
        expect(reportSigned(0)).toBe('0,00 €')
        expect(reportSigned(0.001)).toBe('0,00 €')
    })
})

describe('pdfText', () => {
    it('strips emoji the built-in font cannot draw, keeping umlauts and digits', () => {
        expect(pdfText('📌 Pins')).toBe('Pins')
        expect(pdfText('🍺 Lokalrunde ⚠️')).toBe('Lokalrunde')
        expect(pdfText('Müller 3x ✋🏽')).toBe('Müller 3x')
    })
})

describe('scaleToFit', () => {
    it('shrinks large logos and never enlarges small ones', () => {
        expect(scaleToFit(800, 400)).toEqual({width: 400, height: 200})
        expect(scaleToFit(100, 50)).toEqual({width: 100, height: 50})
    })
})

describe('renderReportPdf', () => {
    it('renders a PDF with the report content', async () => {
        const bytes = await renderReportPdf(DATA)
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
        expect(bytes.length).toBeGreaterThan(2000)
    })

    it('renders with branding, deactivated accounts and a guest cap', async () => {
        const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        const bytes = await renderReportPdf({
            ...DATA,
            accounts: [{...DATA.accounts[0], deactivated: true}],
            monthly: {...DATA.monthly, guest_penalty_cap: 5},
        }, {color: '#e8a020', logo: {src: tinyPng, width: 1, height: 1}})
        expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
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

describe('bookingsByMonth', () => {
    it('adds a heading row per month with the cash net, leaving write-offs out', () => {
        const rows = bookingsByMonth([
            {date: '03.03.2025', type: 'Einzahlung', description: 'A', amount: 20, note: ''},
            {date: '10.03.2025', type: 'Ausgabe', description: 'Bahn', amount: -5, note: ''},
            {date: '12.03.2025', type: 'Abschreibung', description: 'A', amount: 9, note: ''},
            {date: '02.04.2025', type: 'Einzahlung', description: 'B', amount: 7, note: ''},
        ])
        const heads = rows.filter(r => r.bold)
        expect(heads.map(r => r.cells[2])).toEqual(['März 2025', 'April 2025'])
        expect(heads.map(r => r.cells[3])).toEqual([reportSigned(15), reportSigned(7)])
        expect(rows).toHaveLength(6)
    })
})

describe('penaltyMatrix', () => {
    it('orders types by cost and flags the extremes per type', () => {
        const m = penaltyMatrix([
            {nickname: 'A', type: 'Pin', count: 1, total: 5},
            {nickname: 'B', type: 'Pin', count: 2, total: 10},
            {nickname: 'A', type: 'Zu spät', count: 1, total: 20},
        ])
        expect(m.types).toEqual(['Zu spät', 'Pin'])
        expect(m.people.find(p => p.name === 'B')?.values).toEqual([0, 10])
        expect(m.extremes.get('Pin')).toEqual({max: 10, min: 5})
        expect(m.extremes.get('Zu spät')).toBeNull() // only one person: nothing to compare
    })
})
