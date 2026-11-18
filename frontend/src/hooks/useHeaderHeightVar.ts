import {type RefObject, useLayoutEffect} from 'react'

/** Publishes the app header's height as `--app-header-h` so sheets open below the top bar. */
export function useHeaderHeightVar(ref: RefObject<HTMLElement | null>) {
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const root = document.documentElement
        const update = () => root.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
        update()
        if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty('--app-header-h')
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => {
            ro.disconnect()
            root.style.removeProperty('--app-header-h')
        }
    }, [ref])
}
