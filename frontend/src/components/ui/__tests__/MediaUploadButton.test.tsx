/**
 * Tests for MediaUploadButton component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/api/client', () => ({
    uploadMedia: vi.fn(),
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))

// ── helpers ───────────────────────────────────────────────────────────────────

async function renderButton(props: {
    value?: string | null
    onUploaded?: (url: string) => void
    onRemove?: () => void
}) {
    const { MediaUploadButton } = await import('../MediaUploadButton')
    return render(
        <MediaUploadButton
            value={props.value ?? null}
            onUploaded={props.onUploaded ?? vi.fn()}
            onRemove={props.onRemove ?? vi.fn()}
        />,
    )
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('MediaUploadButton — no value', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders 🖼 upload button when no value', async () => {
        await renderButton({})
        expect(screen.getByText('🖼')).toBeInTheDocument()
    })

    it('has hidden file input', async () => {
        await renderButton({})
        const input = document.querySelector('input[type="file"]')
        expect(input).toBeInTheDocument()
        expect(input).toHaveClass('hidden')
    })

    it('accepts image file types', async () => {
        await renderButton({})
        const input = document.querySelector('input[type="file"]')
        expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif')
    })

    it('calls uploadMedia when file selected', async () => {
        const { uploadMedia } = await import('@/api/client')
        vi.mocked(uploadMedia).mockResolvedValue('https://example.com/img.jpg')
        const onUploaded = vi.fn()
        await renderButton({ onUploaded })

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
        Object.defineProperty(input, 'files', { value: [file], configurable: true })
        fireEvent.change(input)

        await waitFor(() => {
            expect(uploadMedia).toHaveBeenCalledWith(file)
            expect(onUploaded).toHaveBeenCalledWith('https://example.com/img.jpg')
        })
    })

    it('calls toastError when upload fails', async () => {
        const { uploadMedia } = await import('@/api/client')
        const { toastError } = await import('@/utils/error.ts')
        vi.mocked(uploadMedia).mockRejectedValue(new Error('Upload failed'))
        await renderButton({})

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
        Object.defineProperty(input, 'files', { value: [file], configurable: true })
        fireEvent.change(input)

        await waitFor(() => {
            expect(toastError).toHaveBeenCalled()
        })
    })

    it('shows ⏳ while uploading', async () => {
        const { uploadMedia } = await import('@/api/client')
        vi.mocked(uploadMedia).mockReturnValue(new Promise(() => {})) // never resolves
        await renderButton({})

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['content'], 'test.jpg', { type: 'image/jpeg' })
        Object.defineProperty(input, 'files', { value: [file], configurable: true })
        fireEvent.change(input)

        await waitFor(() => {
            expect(screen.getByText('⏳')).toBeInTheDocument()
        })
    })
})

describe('MediaUploadButton — with value', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows thumbnail when value provided', async () => {
        await renderButton({ value: 'https://example.com/img.jpg' })
        const img = document.querySelector('img') as HTMLImageElement
        expect(img).toBeInTheDocument()
        expect(img.src).toBe('https://example.com/img.jpg')
    })

    it('shows remove button when value provided', async () => {
        await renderButton({ value: 'https://example.com/img.jpg' })
        expect(screen.getByText('×')).toBeInTheDocument()
    })

    it('calls onRemove when × clicked', async () => {
        const onRemove = vi.fn()
        await renderButton({ value: 'https://example.com/img.jpg', onRemove })
        fireEvent.click(screen.getByText('×'))
        expect(onRemove).toHaveBeenCalled()
    })

    it('does not render file input when value provided', async () => {
        await renderButton({ value: 'https://example.com/img.jpg' })
        expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument()
    })
})
