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

export async function reverseGeocode(
    latitude: number, longitude: number, locale: string, signal?: AbortSignal,
): Promise<string | null> {
    try {
        const qs = new URLSearchParams({
            format: 'jsonv2', zoom: '10', addressdetails: '1',
            lat: latitude.toFixed(5), lon: longitude.toFixed(5),
            'accept-language': locale === 'en' ? 'en' : 'de',
        })
        const timeout = AbortSignal.timeout(6000)
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${qs}`, {
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
        if (!res.ok) return null
        const data = await res.json() as { address?: NominatimAddress }
        return placeLabel(data.address)
    } catch {
        return null
    }
}
