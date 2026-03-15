import { useEffect, useState } from 'react'

export interface ToastMessage { id: number; text: string; type?: 'success'|'error'|'info' }

let _listeners: ((msg: ToastMessage) => void)[] = []
let _id = 0

export function showToast(text: string, type: ToastMessage['type'] = 'success') {
  const msg = { id: ++_id, text, type }
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
    return () => { _listeners = _listeners.filter(f => f !== handler) }
  }, [])

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`px-4 py-2 rounded-xl text-xs font-bold shadow-lg animate-fade-in
            ${t.type === 'error' ? 'bg-red-800 text-red-100' : 'bg-kce-olive text-kce-cream'}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
