import {describe, it, expect, beforeEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import {WhatsNewSheet} from '../WhatsNewSheet'
import {useWhatsNewStore} from '@/store/whatsNew'
import {useI18n} from '@/i18n'
import type {Release} from '@/lib/changelog'

const releases: Release[] = [
    {version: '1.2.0', date: '2026-11-06', sections: [
        {type: 'feat', items: [{key: 'a', text: {en: 'Shiny thing', de: 'Glänzendes Ding'}}]},
        {type: 'deps', items: [{key: 'd', text: {en: 'bump vite'}}]},
    ]},
    {version: '1.1.0', date: '2026-10-01', sections: [
        {type: 'fix', items: [{key: 'b', text: {en: 'Only English'}}]},
    ]},
]

beforeEach(() => {
    useWhatsNewStore.setState({lastSeen: null})
    useI18n.setState({locale: 'de'})
})

describe('WhatsNewSheet', () => {
    it('shows releases newest first in German, hiding dependency entries', () => {
        render(<WhatsNewSheet open onClose={() => {}} releases={releases}/>)
        expect(screen.getByText('Glänzendes Ding')).toBeTruthy()
        expect(screen.queryByText('bump vite')).toBeNull()
        const versions = screen.getAllByRole('heading', {level: 3}).map(h => h.textContent)
        expect(versions[0]).toContain('1.2.0')
    })
    it('uses English text in English and falls back for untranslated German', () => {
        useI18n.setState({locale: 'en'})
        render(<WhatsNewSheet open onClose={() => {}} releases={releases}/>)
        expect(screen.getByText('Shiny thing')).toBeTruthy()
        useI18n.setState({locale: 'de'})
    })
    it('falls back to English when no German text exists', () => {
        render(<WhatsNewSheet open onClose={() => {}} releases={releases}/>)
        expect(screen.getByText('Only English')).toBeTruthy()
    })
    it('marks the latest version as seen and flags only newer releases as new', () => {
        useWhatsNewStore.setState({lastSeen: '1.1.0'})
        render(<WhatsNewSheet open onClose={() => {}} releases={releases}/>)
        expect(screen.getAllByTestId('whats-new-pill')).toHaveLength(1)
        expect(useWhatsNewStore.getState().lastSeen).toBe('1.2.0')
    })
    it('shows an empty state without releases', () => {
        render(<WhatsNewSheet open onClose={() => {}} releases={[]}/>)
        expect(screen.getByText('Noch keine Neuigkeiten.')).toBeTruthy()
    })
})
