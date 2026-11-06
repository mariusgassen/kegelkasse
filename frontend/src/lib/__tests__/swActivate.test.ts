import {describe, expect, it, vi} from 'vitest'
import {activateNewWorker, waitForState} from '../swActivate'

class FakeWorker extends EventTarget {
    state: ServiceWorkerState
    postMessage = vi.fn()
    constructor(state: ServiceWorkerState) {
        super()
        this.state = state
    }
    go(state: ServiceWorkerState) {
        this.state = state
        this.dispatchEvent(new Event('statechange'))
    }
}

function asWorker(w: FakeWorker) {
    return w as unknown as ServiceWorker
}

function registration(opts: {installing?: FakeWorker; waiting?: FakeWorker; update?: () => Promise<void>}) {
    return {
        installing: opts.installing ?? null,
        waiting: opts.waiting ?? null,
        update: opts.update ?? (() => Promise.resolve()),
    } as unknown as ServiceWorkerRegistration
}

describe('waitForState', () => {
    it('resolves immediately when the state is already reached', async () => {
        expect(await waitForState(asWorker(new FakeWorker('activated')), 'installed', 100)).toBe(true)
    })

    it('waits for statechange', async () => {
        const w = new FakeWorker('installing')
        const p = waitForState(asWorker(w), 'installed', 1000)
        w.go('installed')
        expect(await p).toBe(true)
    })

    it('fails when the worker becomes redundant', async () => {
        const w = new FakeWorker('installing')
        const p = waitForState(asWorker(w), 'installed', 1000)
        w.go('redundant')
        expect(await p).toBe(false)
    })

    it('fails after the timeout', async () => {
        vi.useFakeTimers()
        const p = waitForState(asWorker(new FakeWorker('installing')), 'installed', 50)
        vi.advanceTimersByTime(60)
        expect(await p).toBe(false)
        vi.useRealTimers()
    })
})

describe('activateNewWorker', () => {
    it('returns false when there is no new version', async () => {
        const update = vi.fn(() => Promise.resolve())
        expect(await activateNewWorker(registration({update}))).toBe(false)
        expect(update).toHaveBeenCalled()
    })

    it('installs, sends SKIP_WAITING and waits for activation', async () => {
        const w = new FakeWorker('installing')
        w.postMessage.mockImplementation(() => queueMicrotask(() => w.go('activated')))
        const p = activateNewWorker(registration({installing: w}), 1000)
        await Promise.resolve()
        w.go('installed')
        expect(await p).toBe(true)
        expect(w.postMessage).toHaveBeenCalledWith({type: 'SKIP_WAITING'})
    })

    it('activates an already waiting worker even if the update check fails', async () => {
        const w = new FakeWorker('installed')
        w.postMessage.mockImplementation(() => queueMicrotask(() => w.go('activated')))
        const reg = registration({waiting: w, update: () => Promise.reject(new Error('offline'))})
        expect(await activateNewWorker(reg, 1000)).toBe(true)
    })

    it('does not send SKIP_WAITING when installation fails', async () => {
        const w = new FakeWorker('installing')
        const p = activateNewWorker(registration({installing: w}), 1000)
        await Promise.resolve()
        w.go('redundant')
        expect(await p).toBe(false)
        expect(w.postMessage).not.toHaveBeenCalled()
    })
})
