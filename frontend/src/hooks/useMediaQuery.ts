import {useEffect, useState} from 'react'

/** Whether a media query matches, kept up to date. `fallback` where `matchMedia` is missing. */
export function useMediaQuery(query: string, fallback = false): boolean {
    const read = () => typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(query)?.matches ?? fallback
        : fallback
    const [matches, setMatches] = useState(read)
    useEffect(() => {
        const mq = window.matchMedia?.(query)
        if (!mq) return
        const update = () => setMatches(mq.matches)
        update()
        mq.addEventListener?.('change', update)
        return () => mq.removeEventListener?.('change', update)
    }, [query])
    return matches
}
