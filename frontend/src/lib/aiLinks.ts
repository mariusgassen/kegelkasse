import {router} from '@/router'
import type {AiLink} from '@/types.ts'

/** Window event that opens the profile sheet (it is an overlay, not a route). */
export const OPEN_PROFILE_EVENT = 'kegelkasse:open-profile'

export type OpenProfileDetail = { tab?: 'season' | 'settings' }

/**
 * Follow a link from an AI search answer: in-app targets navigate the router, the profile
 * opens the profile sheet, docs open the documentation in a new tab (served by the backend
 * at /docs, outside the SPA). Returns true when the app navigated, so callers can close
 * the sheet they live in.
 */
export function followAiLink(link: AiLink): boolean {
    if (link.kind === 'docs') {
        window.open(link.url, '_blank', 'noopener')
        return false
    }
    if (link.kind === 'profile') {
        window.dispatchEvent(new CustomEvent<OpenProfileDetail>(OPEN_PROFILE_EVENT, {detail: {tab: link.tab}}))
        return true
    }
    router.navigate({to: link.to, search: link.search} as never).catch(() => {})
    return true
}
