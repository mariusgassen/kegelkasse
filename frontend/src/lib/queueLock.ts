import {t} from '@/i18n'

/** How long someone who taps "undo" or "delete" waits for a running sync before giving up. */
export const QUEUE_WAIT_MS = 5000

export class QueueBusyError extends Error {
    constructor() {
        super(t('sync.busy'))
        this.name = 'QueueBusyError'
    }
}

let tail: Promise<void> = Promise.resolve()

/**
 * Runs the tasks that work on the offline queue one after another. The sync reads the queue, sends
 * and then removes; taking a queued booking back must not happen in between, or it disappears from
 * the queue although the server still receives it.
 *
 * With `maxWaitMs` a task that has not started by then is dropped for good and the call rejects with
 * `QueueBusyError`: a request hanging on a bad connection must not leave the user waiting.
 */
export function withQueueLock<T>(task: () => Promise<T>, maxWaitMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        let dropped = false
        const timer = maxWaitMs === undefined ? undefined : setTimeout(() => {
            dropped = true
            reject(new QueueBusyError())
        }, maxWaitMs)
        tail = tail.then(async () => {
            if (dropped) return
            clearTimeout(timer)
            await task().then(resolve, reject)
        })
    })
}
