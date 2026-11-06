import {api} from '@/api/client'

/** True when this browser can do Web Push at all (iOS only inside an installed PWA). */
export function pushSupported(): boolean {
    return typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator
        && 'Notification' in window
}

/**
 * Ask for notification permission, subscribe this device and register it with the server.
 * Returns 'granted' on success, 'denied' when the user (or browser) refused.
 * Must be called from a user gesture (iOS refuses the permission prompt otherwise).
 */
export async function subscribeThisDevice(): Promise<'granted' | 'denied'> {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.ready
    const {public_key} = await api.getVapidPublicKey()
    const padding = '='.repeat((4 - public_key.length % 4) % 4)
    const base64 = (public_key + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
    const sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: key})
    const subJson = sub.toJSON()
    await api.subscribeToPush({
        endpoint: subJson.endpoint!,
        p256dh: subJson.keys!.p256dh,
        auth: subJson.keys!.auth,
    })
    return 'granted'
}
