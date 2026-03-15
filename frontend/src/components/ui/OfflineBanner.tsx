import {useEffect, useState} from 'react'
import {useT} from '@/i18n'

export function OfflineBanner() {
    const [offline, setOffline] = useState(!navigator.onLine)
    const t = useT()

    useEffect(() => {
        const on = () => setOffline(false)
        const off = () => setOffline(true)
        window.addEventListener('online', on)
        window.addEventListener('offline', off)
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off)
        }
    }, [])

    if (!offline) return null
    return (
        <div className="offline-banner">
            📵 {t('sync.offline')}
        </div>
    )
}
