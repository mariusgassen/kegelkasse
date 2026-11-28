import {afterEach, describe, expect, it, vi} from 'vitest'
import {QueueBusyError, withQueueLock} from '../queueLock'

afterEach(() => { vi.useRealTimers() })

/** A task that runs until `finish` is called. */
function held() {
    let finish!: () => void
    const promise = new Promise<void>(resolve => { finish = resolve })
    return {task: () => promise, finish}
}

describe('withQueueLock', () => {
    it('runs one task after the other, also after one has failed', async () => {
        const first = held()
        const second = vi.fn(async () => 'done')
        const failing = withQueueLock(async () => { await first.task(); throw new Error('boom') })
        const next = withQueueLock(second)
        await Promise.resolve()
        expect(second).not.toHaveBeenCalled()
        first.finish()
        await expect(failing).rejects.toThrow('boom')
        await expect(next).resolves.toBe('done')
    })

    it('gives up after the waiting time and never runs the dropped task', async () => {
        vi.useFakeTimers()
        const first = held()
        const late = vi.fn(async () => {})
        const running = withQueueLock(first.task)
        const waiting = expect(withQueueLock(late, 1000)).rejects.toBeInstanceOf(QueueBusyError)
        await vi.advanceTimersByTimeAsync(1000)
        await waiting
        first.finish()
        await running
        await withQueueLock(async () => {})
        expect(late).not.toHaveBeenCalled()
    })

    it('does not time out a task that has started', async () => {
        vi.useFakeTimers()
        const slow = held()
        const result = withQueueLock(slow.task, 1000)
        await vi.advanceTimersByTimeAsync(5000)
        slow.finish()
        await expect(result).resolves.toBeUndefined()
    })
})
