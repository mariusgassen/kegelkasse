let tail: Promise<unknown> = Promise.resolve()

/**
 * Runs the tasks that work on the offline queue one after another. The sync reads the queue, sends
 * and then removes; taking a queued booking back must not happen in between, or it disappears from
 * the queue although the server still receives it.
 */
export function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task)
    tail = run.catch(() => {})
    return run
}
