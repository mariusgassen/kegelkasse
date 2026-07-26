import {useEffect, useState} from 'react'
import {haptic} from '@/lib/haptics'

export interface ToastMessage {
    id: number;
    text: string;
    type?: 'success' | 'error' | 'info'
}

let _listeners: ((msg: ToastMessage) => void)[] = []
let _id = 0

export function showToast(text: string, type: ToastMessage['type'] = 'success') {
    // Every create/update/delete in the app already ends in a toast, so wiring haptics (#72) here
    // gives the whole app confirmation feedback from one place instead of at ~200 call sites.
    // `info` stays silent — it is used for passive notices nobody asked for.
    if (type === 'success') haptic('success')
    else if (type === 'error') haptic('error')
    const msg = {id: ++_id, text, type}
    _listeners.forEach(fn => fn(msg))
}

export function ToastContainer() {
    const [toasts, setToasts] = useState<ToastMessage[]>([])

    useEffect(() => {
        const handler = (msg: ToastMessage) => {
            setToasts(t => [...t, msg])
            setTimeout(() => setToasts(t => t.filter(x => x.id !== msg.id)), 2800)
        }
        _listeners.push(handler)
        return () => {
            _listeners = _listeners.filter(f => f !== handler)
        }
    }, [])

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div key={t.id}
                     className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-fade-in
            ${t.type === 'error' ? 'bg-danger text-on-danger' : 'bg-accent-2 text-ink'}`}>
                    {t.text}
                </div>
            ))}
        </div>
    )
}
