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

    it('closes on close button click', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'action.close' }))
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes on Escape key', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes on backdrop click but not on image click', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        const dialog = screen.getByRole('dialog')
        fireEvent.click(dialog.querySelector('img')!)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        fireEvent.click(dialog, { target: dialog })
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('locks body scroll while open and restores it on close', () => {
        render(<ZoomableImage src="https://example.com/photo.jpg" />)
        fireEvent.click(screen.getByRole('button', { name: 'media.viewFullscreen' }))
        expect(document.body.style.overflow).toBe('hidden')
        fireEvent.click(screen.getByRole('button', { name: 'action.close' }))
        expect(document.body.style.overflow).toBe('')
    })
})
