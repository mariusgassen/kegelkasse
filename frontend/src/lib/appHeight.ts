// Reliable app height for iOS/Android standalone PWAs.
//
// No CSS viewport unit lands correctly on an installed iOS PWA (viewport-fit=cover):
//   • height:100%, 100dvh, 100svh and position:fixed;inset:0 resolve to the *safe* viewport
//     (excluding the home-indicator zone) → a dead strip of body background below the bottom nav.
//   • 100vh over-reports → the shell runs past the physical bottom, so the home indicator cuts
//     off the bottom nav's labels.
// window.innerHeight is neither: it is exactly the number of CSS pixels the web view occupies,
// which in a standalone PWA (no browser chrome) is the whole screen. We publish it as the
// --app-height custom property and the shell (#root) uses it, so the shell reaches the true
// bottom edge and the nav's env(safe-area-inset-bottom) padding lifts the labels above the home
// indicator. It also tracks Safari's show/hide toolbars in a normal browser tab.

export function measureAppHeight(): number {
    // visualViewport excludes the on-screen keyboard, which would shrink the shell mid-typing;
    // innerHeight is the stable layout-viewport height we want for the app frame.
    return window.innerHeight
}

export function applyAppHeight(): void {
    document.documentElement.style.setProperty('--app-height', `${measureAppHeight()}px`)
}

let installed = false

export function installAppHeight(): () => void {
    applyAppHeight()
    if (installed) return () => {}
    installed = true
    // orientationchange/resize cover rotation and toolbar transitions. A deferred re-apply after
    // orientationchange handles iOS reporting the pre-rotation height on the synchronous event.
    const onResize = () => applyAppHeight()
    const onOrientation = () => { applyAppHeight(); setTimeout(applyAppHeight, 300) }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onOrientation)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('orientationchange', onOrientation)
        window.visualViewport?.removeEventListener('resize', onResize)
        installed = false
    }
}
