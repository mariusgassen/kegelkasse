import {describe, it, expect} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {LazyImage} from '../LazyImage'
import {thumbUrl, isMediaUrl} from '@/lib/mediaUrl.ts'

describe('mediaUrl', () => {
    it('only asks the server for variants of uploaded photos', () => {
        expect(isMediaUrl('/uploads/media/a.jpg')).toBe(true)
        expect(isMediaUrl('/uploads/logos/a.png')).toBe(false)
        expect(thumbUrl('/uploads/media/a.jpg', 480)).toBe('/uploads/media/a.jpg?w=480')
        expect(thumbUrl('https://x/y.jpg', 480)).toBe('https://x/y.jpg')
    })
})

describe('LazyImage', () => {
    it('shows a blurred preview until the photo has loaded, then fades the photo in', () => {
        const {container} = render(<LazyImage src="/uploads/media/a.jpg" alt="Foto" className="photo"/>)
        const box = screen.getByTestId('lazy-image')
        expect(box.dataset.loaded).toBe('false')
        const imgs = container.querySelectorAll('img')
        expect(imgs[0].getAttribute('src')).toBe('/uploads/media/a.jpg?w=960')
        expect(imgs[0].style.opacity).toBe('0')
        expect(imgs).toHaveLength(2)
        expect(imgs[1].getAttribute('src')).toBe('/uploads/media/a.jpg?w=240')
        fireEvent.load(imgs[0])
        expect(box.dataset.loaded).toBe('true')
        expect(container.querySelectorAll('img')).toHaveLength(1)
        expect(container.querySelector('img')!.style.opacity).toBe('1')
    })

    it('does not leave a broken placeholder behind when the photo fails', () => {
        const {container} = render(<LazyImage src="/uploads/media/a.jpg"/>)
        fireEvent.error(container.querySelector('img')!)
        expect(screen.getByTestId('lazy-image').dataset.loaded).toBe('true')
    })

    it('renders other URLs as a plain lazy image', () => {
        const {container} = render(<LazyImage src="https://x/y.jpg" className="p"/>)
        const img = container.querySelector('img')!
        expect(img.getAttribute('src')).toBe('https://x/y.jpg')
        expect(img.getAttribute('loading')).toBe('lazy')
        expect(screen.queryByTestId('lazy-image')).toBeNull()
    })
})
