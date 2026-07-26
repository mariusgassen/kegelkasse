import {flushSync} from 'react-dom'
import {flourishEnabled} from '@/lib/motion'

interface ViewTransition {
    finished: Promise<void>
    ready: Promise<void>
    updateCallbackDone: Promise<void>
}

type DocumentWithViewTransitions = Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => ViewTransition
}

/** Whether the browser can cross-fade/morph between two DOM states for us. */
export function supportsViewTransitions(): boolean {
    if (typeof document === 'undefined') return false
    return typeof (document as DocumentWithViewTransitions).startViewTransition === 'function'
}

/**
 * Run a React state update inside a View Transition (#72) — progressive enhancement, nothing more.
 *
 * Where the API exists and motion is wanted, the browser snapshots the page before and after
 * `update`, then animates between them; elements sharing a `view-transition-name` morph into each
 * other instead of one cutting to the other. Where it does not (Firefox at time of writing, jsdom,
 * reduced motion, effects switched off), `update` simply runs and the app keeps the CSS enter
 * animations it already had. Callers never branch on support.
 *
 * `flushSync` is required: without it React would batch the update to *after* the browser has taken
 * its "new" snapshot, and the transition would animate from one state to the same state.
 *
 * @returns a promise that resolves once the animation has finished (immediately in the fallback).
 */
export function startViewTransition(update: () => void): Promise<void> {
    const doc = document as DocumentWithViewTransitions
    if (!flourishEnabled() || typeof doc.startViewTransition !== 'function') {
        update()
        return Promise.resolve()
    }
    const transition = doc.startViewTransition(() => {
        flushSync(update)
    })
    return transition.finished.catch(() => {})
}

/** The name shared by a tapped card and the sheet it grows into. Only one pair may be live at a time. */
export const MORPH_NAME = 'kce-morph'

/**
 * Tag `element` as the *origin* of a shared-element transition, run `update`, then untag it.
 *
 * The browser only allows one element per `view-transition-name` in each snapshot, which is exactly
 * the shape of "card morphs into sheet": the card carries the name in the old snapshot, the sheet
 * carries it in the new one. The tag is removed once the animation settles so the next tap starts
 * from a clean slate — and removed synchronously in the fallback path, where nothing animated.
 */
export function morphFrom(element: HTMLElement | null | undefined, update: () => void): Promise<void> {
    if (!element || !flourishEnabled() || !supportsViewTransitions()) {
        update()
        return Promise.resolve()
    }
    element.style.viewTransitionName = MORPH_NAME
    return startViewTransition(update).finally(() => {
        element.style.viewTransitionName = ''
    })
}
