import {router} from '@/router'
import type {AiLink} from '@/types.ts'
import {useDocsViewer} from '@/store/docsViewer'

/** Window event that opens the profile sheet (it is an overlay, not a route). */
export const OPEN_PROFILE_EVENT = 'kegelkasse:open-profile'

export type OpenProfileDetail = { tab?: 'season' | 'settings' }

/**
 * Follow a link from an AI search answer: in-app targets navigate the router, the profile
 * opens the profile sheet, docs open in the in-app docs viewer (served by the backend at
 * /docs, outside the SPA, so shown in an iframe sheet instead of leaving for the browser). Returns true
 * when the app navigated, so callers can close the sheet they live in; the docs viewer stacks on top
 * of the search, so that stays open underneath.
 */
export function followAiLink(link: AiLink): boolean {
    if (link.kind === 'docs') {
        useDocsViewer.getState().open(link.url)
        return false
    }
    if (link.kind === 'profile') {
        window.dispatchEvent(new CustomEvent<OpenProfileDetail>(OPEN_PROFILE_EVENT, {detail: {tab: link.tab}}))
        return true
    }
    router.navigate({to: link.to, search: link.search} as never).catch(() => {})
    return true
}
