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
