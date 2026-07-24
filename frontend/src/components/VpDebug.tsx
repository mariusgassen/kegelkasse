/**
 * On-device viewport diagnostic overlay. TEMPORARY — used to pin down the iOS PWA bottom
 * dead-space bug from real device numbers instead of guessing CSS viewport behaviour.
 *
 * Toggle: tap the club logo / title in the header 5× quickly (see RootLayout). No URL param,
 * because an installed standalone PWA has no editable address bar.
 */
import {useCallback, useEffect, useState} from 'react'

declare const __APP_VERSION__: string
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '(dev)'

function readInset(side: 'top' | 'right' | 'bottom' | 'left'): string {
    // A probe element whose padding is env(safe-area-inset-*); getComputedStyle resolves it to px.
    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.paddingTop = `env(safe-area-inset-${side}, -1px)`
    document.body.appendChild(probe)
    const v = getComputedStyle(probe).paddingTop
    probe.remove()
    return v
}

interface Snapshot {
    version: string
    standalone: boolean
    displayMode: string
    innerH: number
    innerW: number
    screenH: number
    screenW: number
    clientH: number
    visualH: number
    visualOffsetTop: number
    rootH: number
    dpr: number
    insetTop: string
    insetBottom: string
}

function snapshot(): Snapshot {
    const dm = ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find(
        m => window.matchMedia(`(display-mode: ${m})`).matches,
    )
    const root = document.getElementById('root')
    return {
        version: APP_VERSION,
        standalone:
            window.matchMedia('(display-mode: standalone)').matches ||
            // iOS legacy standalone flag
            (window.navigator as unknown as {standalone?: boolean}).standalone === true,
        displayMode: dm ?? 'unknown',
        innerH: window.innerHeight,
        innerW: window.innerWidth,
        screenH: window.screen.height,
        screenW: window.screen.width,
        clientH: document.documentElement.clientHeight,
        visualH: Math.round(window.visualViewport?.height ?? 0),
        visualOffsetTop: Math.round(window.visualViewport?.offsetTop ?? 0),
        rootH: root ? Math.round(root.getBoundingClientRect().height) : 0,
        dpr: window.devicePixelRatio,
        insetTop: readInset('top'),
        insetBottom: readInset('bottom'),
    }
}

export function VpDebug({onClose}: {onClose: () => void}) {
    const [snap, setSnap] = useState<Snapshot>(snapshot)
    const refresh = useCallback(() => setSnap(snapshot()), [])

    useEffect(() => {
        const on = () => refresh()
        window.addEventListener('resize', on)
        window.addEventListener('orientationchange', on)
        window.visualViewport?.addEventListener('resize', on)
        return () => {
            window.removeEventListener('resize', on)
            window.removeEventListener('orientationchange', on)
            window.visualViewport?.removeEventListener('resize', on)
        }
    }, [refresh])

    const rows: [string, string | number | boolean][] = [
        ['version', snap.version],
        ['standalone', snap.standalone],
        ['display-mode', snap.displayMode],
        ['innerHeight', snap.innerH],
        ['screen.height', snap.screenH],
        ['docEl.clientH', snap.clientH],
        ['visualViewport.h', snap.visualH],
        ['visualVP.offsetTop', snap.visualOffsetTop],
        ['#root height', snap.rootH],
        ['devicePixelRatio', snap.dpr],
        ['inset-top', snap.insetTop],
        ['inset-bottom', snap.insetBottom],
        ['innerW × screenW', `${snap.innerW} × ${snap.screenW}`],
    ]

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'rgba(0,0,0,0.92)',
                color: '#fff',
                fontFamily: 'monospace',
                fontSize: 14,
                padding: '24px 20px',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}>
            <div style={{fontWeight: 700, fontSize: 16}}>Viewport-Diagnose</div>
            <table style={{borderCollapse: 'collapse', width: '100%'}}>
                <tbody>
                    {rows.map(([k, v]) => (
                        <tr key={k}>
                            <td style={{padding: '4px 8px', color: '#aaa', whiteSpace: 'nowrap'}}>{k}</td>
                            <td style={{padding: '4px 8px', fontWeight: 700, textAlign: 'right'}}>{String(v)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p style={{color: '#e8a020', fontSize: 12, lineHeight: 1.4}}>
                Screenshot machen und schicken. Wichtig: <b>inset-bottom</b>, <b>#root height</b> vs{' '}
                <b>screen.height</b>, <b>version</b>.
            </p>
            <div style={{display: 'flex', gap: 10, marginTop: 8}}>
                <button
                    onClick={refresh}
                    style={{flex: 1, padding: '12px', background: '#333', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 700}}>
                    Aktualisieren
                </button>
                <button
                    onClick={onClose}
                    style={{flex: 1, padding: '12px', background: '#e8a020', color: '#000', borderRadius: 8, border: 'none', fontWeight: 700}}>
                    Schließen
                </button>
            </div>
        </div>
    )
}
