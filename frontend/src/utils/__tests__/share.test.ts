import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { shareOrCopy } from '../share'

describe('shareOrCopy', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('uses Web Share API when available and returns true', async () => {
        const share = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } })

        const result = await shareOrCopy('https://example.com', 'My Title')
        expect(share).toHaveBeenCalledWith({ url: 'https://example.com', title: 'My Title' })
        expect(result).toBe(true)
    })

    it('falls back to clipboard when share throws (user cancelled)', async () => {
        const share = vi.fn().mockRejectedValue(new Error('AbortError'))
        const writeText = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', { share, clipboard: { writeText } })

        const result = await shareOrCopy('https://example.com', 'My Title')
        expect(writeText).toHaveBeenCalledWith('https://example.com')
        expect(result).toBe(false)
    })

    it('falls back to clipboard when Web Share API is not available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', { clipboard: { writeText } })

        const result = await shareOrCopy('https://example.com', 'My Title')
        expect(writeText).toHaveBeenCalledWith('https://example.com')
        expect(result).toBe(false)
    })
})
