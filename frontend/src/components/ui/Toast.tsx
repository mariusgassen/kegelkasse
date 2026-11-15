import {haptic} from '@/lib/haptics'

export interface ToastMessage {
    id: number;
    text: string;
    type?: 'success' | 'error' | 'info'
}

let _listeners: ((msg: ToastMessage) => void)[] = []
let _id = 0

/**
 * Feedback after mutations. Rendered by `ToastActivity` in the Dynamic Island (`EveningIsland.tsx`);
 * this module only owns the call API and the subscription.
 */
export function showToast(text: string, type: ToastMessage['type'] = 'success') {
    // Every create/update/delete in the app already ends in a toast, so wiring haptics (#72) here
    // gives the whole app confirmation feedback from one place instead of at ~200 call sites.
    // `info` stays silent — it is used for passive notices nobody asked for.
    if (type === 'success') haptic('success')
    else if (type === 'error') haptic('error')
    const msg = {id: ++_id, text, type}
    _listeners.forEach(fn => fn(msg))
}

/** Subscribe to toasts; returns the unsubscribe function. */
export function subscribeToast(fn: (msg: ToastMessage) => void): () => void {
    _listeners.push(fn)
    return () => {
        _listeners = _listeners.filter(f => f !== fn)
    }
}
