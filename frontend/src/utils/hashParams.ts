/** Parse query params embedded in the URL hash (e.g. #schedule?event=5). */
export function getHashParams(): URLSearchParams {
    const hash = window.location.hash          // '#schedule?event=5'
    const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
    return new URLSearchParams(q)
}

/** Remove query params from the hash without reloading or triggering hashchange. */
export function clearHashParams() {
    const base = window.location.hash.split('?')[0]  // '#schedule'
    history.replaceState({}, '', window.location.pathname + base)
}
