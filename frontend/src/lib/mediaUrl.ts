/** Uploaded photos are served by the app at /uploads/media/…; `?w=N` asks for a smaller copy
 *  (240/480/960/1600 px, built once on the server and cached) so lists, maps and previews do not
 *  download the full upload. Any other URL (external, data:, blob:) is returned unchanged. */
export function isMediaUrl(url: string): boolean {
    return url.startsWith('/uploads/media/')
}

export function thumbUrl(url: string, width: number): string {
    return isMediaUrl(url) ? `${url}?w=${width}` : url
}

const preloaded = new Set<string>()

/** Warm the browser cache with a photo the user is likely to open next (e.g. the neighbours of the
 *  photo shown in the fullscreen viewer). Each URL is requested at most once; non-uploads are skipped. */
export function preloadImage(url: string | undefined, width: number): void {
    if (!url || !isMediaUrl(url) || typeof Image === 'undefined') return
    const href = thumbUrl(url, width)
    if (preloaded.has(href)) return
    preloaded.add(href)
    new Image().src = href
}
