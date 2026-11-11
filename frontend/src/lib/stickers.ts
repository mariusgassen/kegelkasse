import type {Sticker} from '@/types.ts'

export interface PlaceGroup {
    place_name: string
    latitude: number
    longitude: number
    /** Newest first (the input order is kept). */
    stickers: Sticker[]
}

/** Stickers within ~100 m (3 decimal places) collapse into one map pin. */
export function groupByPlace(stickers: Sticker[]): PlaceGroup[] {
    const groups = new Map<string, PlaceGroup>()
    for (const s of stickers) {
        const key = `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`
        const g = groups.get(key)
        if (g) g.stickers.push(s)
        else groups.set(key, {place_name: s.place_name, latitude: s.latitude, longitude: s.longitude, stickers: [s]})
    }
    return [...groups.values()]
}

export function placeCount(stickers: Sticker[]): number {
    return groupByPlace(stickers).length
}

/** Every photo at a pin, newest post first, each post's photos in order. */
export function groupPhotos(g: PlaceGroup): string[] {
    return g.stickers.flatMap(s => s.media_urls)
}

/** Feed search: place, caption or author, case-insensitive; all words must match somewhere. */
export function matchesSticker(s: Sticker, query: string, extraAuthorNames: string[] = []): boolean {
    const hay = `${s.place_name} ${s.caption ?? ''} ${s.created_by_name ?? ''} ${extraAuthorNames.join(' ')}`.toLowerCase()
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

/** Distinct non-empty poster names across the sticker list, in order of first appearance. */
export function posterNames(stickers: Sticker[]): string[] {
    const seen = new Set<string>()
    for (const s of stickers) {
        const name = s.created_by_name?.trim()
        if (name) seen.add(name)
    }
    return [...seen]
}

/** Web-Mercator position in pixels of the whole world at `zoom` (256 px tiles). */
function worldPx(lat: number, lng: number, zoom: number): [number, number] {
    const size = 256 * 2 ** zoom
    const clamped = Math.max(-85, Math.min(85, lat)) * Math.PI / 180
    const x = (lng + 180) / 360 * size
    const y = (1 - Math.log(Math.tan(clamped) + 1 / Math.cos(clamped)) / Math.PI) / 2 * size
    return [x, y]
}

/** Pins closer than this on screen (px) merge into one. A pin is 48 px, so a little more. */
export const CLUSTER_PX = 60

export interface MapCluster extends PlaceGroup {
    /** Distinct places (≈100 m) inside — more than one means zooming in will split it. */
    places: number
}

/**
 * Cluster stickers for the map at a zoom level: zoomed out, neighbouring places merge into one
 * numbered pin; zoomed in they separate again. Grid cells are measured in screen pixels, so the
 * same code works at every zoom. Newest first inside a cluster (the input order is kept).
 */
export function clusterByZoom(stickers: Sticker[], zoom: number): MapCluster[] {
    const cells = new Map<string, Sticker[]>()
    for (const s of stickers) {
        const [x, y] = worldPx(s.latitude, s.longitude, zoom)
        const key = `${Math.floor(x / CLUSTER_PX)}:${Math.floor(y / CLUSTER_PX)}`
        const list = cells.get(key)
        if (list) list.push(s)
        else cells.set(key, [s])
    }
    return [...cells.values()].map(list => {
        const places = new Set(list.map(s => `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`)).size
        return {
            place_name: places > 1 ? `${list[0].place_name} +${places - 1}` : list[0].place_name,
            latitude: list.reduce((a, s) => a + s.latitude, 0) / list.length,
            longitude: list.reduce((a, s) => a + s.longitude, 0) / list.length,
            stickers: list,
            places,
        }
    })
}
