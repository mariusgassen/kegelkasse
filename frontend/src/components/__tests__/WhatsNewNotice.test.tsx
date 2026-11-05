import {describe, it, expect, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {WhatsNewNotice} from '../WhatsNewNotice'
import {useWhatsNewStore} from '@/store/whatsNew'
import {useI18n} from '@/i18n'
import type {Release} from '@/lib/changelog'

const releases: Release[] = [
    {version: '1.2.0', sections: [{type: 'feat', items: [{key: 'a', text: {en: 'Shiny thing', de: 'Glänzendes Ding'}}]}]},
]

beforeEach(() => {
    useWhatsNewStore.setState({lastSeen: null})
    useI18n.setState({locale: 'de'})
})

describe('WhatsNewNotice', () => {
    it('announces an unseen release', () => {
        render(<WhatsNewNotice releases={releases}/>)
        expect(screen.getByRole('status').textContent).toContain('1.2.0')
    })
    it('stays hidden when the release was already seen or none exists', () => {
        useWhatsNewStore.setState({lastSeen: '1.2.0'})
        const {unmount} = render(<WhatsNewNotice releases={releases}/>)
        expect(screen.queryByRole('status')).toBeNull()
        unmount()
        useWhatsNewStore.setState({lastSeen: null})
        render(<WhatsNewNotice releases={[]}/>)
        expect(screen.queryByRole('status')).toBeNull()
    })
    it('dismissing records the version so it is shown only once', () => {
        render(<WhatsNewNotice releases={releases}/>)
        fireEvent.click(screen.getByLabelText('Schließen'))
        expect(screen.queryByRole('status')).toBeNull()
        expect(useWhatsNewStore.getState().lastSeen).toBe('1.2.0')
    })
    it('opening the sheet marks it seen and keeps the sheet mounted', () => {
        render(<WhatsNewNotice releases={releases}/>)
        fireEvent.click(screen.getByText('Ansehen'))
        expect(screen.queryByRole('status')).toBeNull()
        expect(screen.getByText('Glänzendes Ding')).toBeTruthy()
    })
})
