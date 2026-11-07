import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ZoomableImage } from '../ZoomableImage'

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

describe('ZoomableImage', () => {
    afterEach(() => {
        document.body.style.overflow = ''
    })

    it('renders the thumbnail but not the fullscreen viewer initially', () => {
        const { container } = render(<ZoomableImage src="https://example.com/photo.jpg" className="thumb" />)
        const img = container.querySelector('img') as HTMLImageElement
        expect(img.src).toBe('https://example.com/photo.jpg')
        expect(img.className).toBe('thumb')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens a fullscreen dialog with the same image on tap', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" alt="Abend-Foto" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toBeInTheDocument()
        const dialogImg = dialog.querySelector('img') as HTMLImageElement
        expect(dialogImg.src).toBe('https://example.com/photo.jpg')
        expect(dialogImg.alt).toBe('Abend-Foto')
    })

    it('has no close button; swiping down dismisses', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        expect(screen.queryByRole('button', { name: 'action.close' })).not.toBeInTheDocument()
        const dialog = screen.getByRole('dialog')
        fireEvent.pointerDown(dialog, { clientX: 100, clientY: 100 })
        fireEvent.pointerMove(dialog, { clientX: 100, clientY: 300 })
        fireEvent.pointerUp(dialog)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('a short swipe does not dismiss', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        const dialog = screen.getByRole('dialog')
        fireEvent.pointerDown(dialog, { clientX: 100, clientY: 100 })
        fireEvent.pointerMove(dialog, { clientX: 100, clientY: 150 })
        fireEvent.pointerUp(dialog)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('tap toggles the metadata overlay with share menu', () => {
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
        render(<ZoomableImage src="/uploads/media/p.jpg" title="Rom" subtitle="1. Mai 2026" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        const dialog = screen.getByRole('dialog')
        expect(screen.queryByText('Rom')).not.toBeInTheDocument()
        fireEvent.pointerDown(dialog, { clientX: 5, clientY: 5 })
        fireEvent.pointerUp(dialog)
        expect(screen.getByText('Rom')).toBeInTheDocument()
        expect(screen.getByText('1. Mai 2026')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'media.share' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /media.copyLink/ }))
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/uploads/media/p.jpg`)
        fireEvent.pointerDown(dialog, { clientX: 5, clientY: 5 })
        fireEvent.pointerUp(dialog)
        expect(screen.queryByText('Rom')).not.toBeInTheDocument()
    })

    it('closes on Escape key', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('locks body scroll while open and restores it on close', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        expect(document.body.style.overflow).toBe('hidden')
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(document.body.style.overflow).toBe('')
    })
})
