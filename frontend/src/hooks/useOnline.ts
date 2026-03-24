import {useEffect, useState} from 'react'

/** Returns true when the browser reports a network connection, false when offline. */
export function useOnline(): boolean {
    const [online, setOnline] = useState(navigator.onLine)
    useEffect(() => {
        const on = () => setOnline(true)
        const off = () => setOnline(false)
        window.addEventListener('online', on)
        window.addEventListener('offline', off)
        return () => {
            window.removeEventListener('online', on)
            window.removeEventListener('offline', off)
        }
    }, [])
    return online
}
