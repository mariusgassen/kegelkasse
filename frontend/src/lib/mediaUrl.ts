/** Uploaded photos are served by the app at /uploads/media/…; `?w=N` asks for a smaller copy
 *  (240/480/960/1600 px, built once on the server and cached) so lists, maps and previews do not
 *  download the full upload. Any other URL (external, data:, blob:) is returned unchanged. */
export function isMediaUrl(url: string): boolean {
    return url.startsWith('/uploads/media/')
}

export function thumbUrl(url: string, width: number): string {
    return isMediaUrl(url) ? `${url}?w=${width}` : url
}
