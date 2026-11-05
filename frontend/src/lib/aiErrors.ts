import type {TranslationKey} from '@/i18n/de'

/** Maps the server's `ai_*` error details onto a readable message key. */
export function aiErrorKey(e: unknown): TranslationKey | null {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'ai_rate_limited') return 'ai.error.rateLimited'
    if (msg.startsWith('ai_')) return 'ai.error.unavailable'
    return null
}
