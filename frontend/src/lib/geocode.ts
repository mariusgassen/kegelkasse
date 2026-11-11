/**
 * Reverse geocoding for the sticker form: turns a map position into "City, Country" so the place
 * name can be pre-filled from a photo's GPS. Uses the public OpenStreetMap Nominatim service (the
 * same provider as the map tiles); one request per photo is well within its usage policy.
 * Never throws — offline or a failed lookup just means the member types the place themselves.
 */
interface NominatimAddress {
    city?: string; town?: string; village?: string; municipality?: string; hamlet?: string
    suburb?: string; county?: string; state?: string; country?: string
}

/** First available settlement name, smallest unit first. */
export function placeLabel(a: NominatimAddress | undefined): string | null {
    if (!a) return null
    const locality = a.city ?? a.town ?? a.village ?? a.municipality ?? a.hamlet ?? a.suburb ?? a.county ?? a.state
    const label = [locality, a.country].filter(Boolean).join(', ')
    return label || null
}

const cache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()

export function clearGeocodeCache(): void {
    cache.clear()
}

export async function reverseGeocode(
    latitude: number, longitude: number, locale: string, signal?: AbortSignal,
): Promise<string | null> {
    const lang = locale === 'en' ? 'en' : 'de'
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}:${lang}`
    const hit = cache.get(key)
    if (hit) return hit

    const job = queue.then(async () => {
        const cached = cache.get(key)
        if (cached) return cached
        try {
            const qs = new URLSearchParams({
                format: 'jsonv2', zoom: '10', addressdetails: '1',
                lat: latitude.toFixed(5), lon: longitude.toFixed(5),
                'accept-language': lang,
            })
            const timeout = AbortSignal.timeout(6000)
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${qs}`, {
                signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
            })
            if (!res.ok) return null
            const data = await res.json() as { address?: NominatimAddress }
            const label = placeLabel(data.address)
            if (label) cache.set(key, label)
            return label
        } catch {
            return null
        }
    })
    queue = job.then(() => undefined, () => undefined)
    return job
}
