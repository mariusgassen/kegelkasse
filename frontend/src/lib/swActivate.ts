/**
 * Pull a new service worker right away instead of waiting for the browser's own update check.
 * Used when a member taps a release push: the old worker handles the click, fetches the new
 * one, tells it to take over (same SKIP_WAITING handshake as the "Aktualisieren" button)
 * and resolves true once it is active, so the caller can reload the open windows.
 */

const STATE_ORDER: ServiceWorkerState[] = ['parsed', 'installing', 'installed', 'activating', 'activated']

function reached(state: ServiceWorkerState, target: ServiceWorkerState): boolean {
    return STATE_ORDER.indexOf(state) >= STATE_ORDER.indexOf(target)
}

/** Resolve true once `worker` is at least in `target` state; false if it dies or times out. */
export function waitForState(worker: ServiceWorker, target: ServiceWorkerState, timeoutMs: number): Promise<boolean> {
    if (worker.state === 'redundant') return Promise.resolve(false)
    if (reached(worker.state, target)) return Promise.resolve(true)
    return new Promise((resolve) => {
        const done = (ok: boolean) => {
            clearTimeout(timer)
            worker.removeEventListener('statechange', onChange)
            resolve(ok)
        }
        const onChange = () => {
            if (worker.state === 'redundant') done(false)
            else if (reached(worker.state, target)) done(true)
        }
        const timer = setTimeout(() => done(false), timeoutMs)
        worker.addEventListener('statechange', onChange)
    })
}

/** Check for a new worker and activate it. Resolves true if a new version took over. */
export async function activateNewWorker(registration: ServiceWorkerRegistration, timeoutMs = 20000): Promise<boolean> {
    try {
        await registration.update()
    } catch {
        // Offline or the server is mid-deploy: a worker found earlier may still be waiting.
    }
    const candidate = registration.installing ?? registration.waiting
    if (!candidate) return false
    if (!(await waitForState(candidate, 'installed', timeoutMs))) return false
    candidate.postMessage({type: 'SKIP_WAITING'})
    return waitForState(candidate, 'activated', timeoutMs)
}
