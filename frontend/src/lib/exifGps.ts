/**
 * Minimal EXIF reader: pulls the GPS position out of a JPEG so a sticker photo taken on the spot
 * can pre-fill its map pin. No dependency — only the handful of tags needed are parsed, and every
 * malformed input returns `null` instead of throwing (EXIF in the wild is routinely broken).
 */
export interface GpsPoint { latitude: number; longitude: number }

const TAG_GPS_IFD = 0x8825
const TAG_LAT_REF = 1
const TAG_LAT = 2
const TAG_LON_REF = 3
const TAG_LON = 4

// Bytes per element for the TIFF field types we may meet (RATIONAL = 5 is the one we need).
const TYPE_SIZE: Record<number, number> = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}

export function parseExifGps(buffer: ArrayBuffer): GpsPoint | null {
    try {
        return read(new DataView(buffer))
    } catch {
        return null
    }
}

function read(v: DataView): GpsPoint | null {
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
    // Walk the JPEG marker segments until the Exif APP1.
    let off = 2
    let tiff = -1
    while (off + 4 <= v.byteLength) {
        if (v.getUint8(off) !== 0xff) return null
        const marker = v.getUint8(off + 1)
        if (marker === 0xda || marker === 0xd9) break // start of scan / end of image: no more metadata
        const len = v.getUint16(off + 2)
        if (marker === 0xe1 && v.getUint32(off + 4) === 0x45786966 /* "Exif" */ && v.getUint16(off + 8) === 0) {
            tiff = off + 10
            break
        }
        off += 2 + len
    }
    if (tiff < 0) return null

    const little = v.getUint16(tiff) === 0x4949
    if (!little && v.getUint16(tiff) !== 0x4d4d) return null
    const u16 = (o: number) => v.getUint16(o, little)
    const u32 = (o: number) => v.getUint32(o, little)

    /** Location of a field's value: inline in the entry when it fits in 4 bytes, else via offset. */
    function valueOffset(entry: number): number {
        const size = (TYPE_SIZE[u16(entry + 2)] ?? 1) * u32(entry + 4)
        return size <= 4 ? entry + 8 : tiff + u32(entry + 8)
    }
    function entries(ifd: number): Map<number, number> {
        const map = new Map<number, number>()
        const n = u16(ifd)
        for (let i = 0; i < n; i++) map.set(u16(ifd + 2 + i * 12), ifd + 2 + i * 12)
        return map
    }

    const gpsPtr = entries(tiff + u32(tiff + 4)).get(TAG_GPS_IFD)
    if (gpsPtr === undefined) return null
    const gps = entries(tiff + u32(gpsPtr + 8))

    const ref = (tag: number) => {
        const e = gps.get(tag)
        return e === undefined ? '' : String.fromCharCode(v.getUint8(valueOffset(e)))
    }
    const dms = (tag: number): number | null => {
        const e = gps.get(tag)
        if (e === undefined || u32(e + 4) !== 3) return null
        const o = valueOffset(e)
        const part = (i: number) => {
            const den = u32(o + i * 8 + 4)
            return den === 0 ? NaN : u32(o + i * 8) / den
        }
        const value = part(0) + part(1) / 60 + part(2) / 3600
        return Number.isFinite(value) ? value : null
    }

    const lat = dms(TAG_LAT)
    const lon = dms(TAG_LON)
    if (lat === null || lon === null) return null
    const latitude = ref(TAG_LAT_REF) === 'S' ? -lat : lat
    const longitude = ref(TAG_LON_REF) === 'W' ? -lon : lon
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
    // (0, 0) is what many cameras write when they had no fix; treat it as "no location".
    if (latitude === 0 && longitude === 0) return null
    return {latitude, longitude}
}

export async function readFileGps(file: File): Promise<GpsPoint | null> {
    if (file.type !== 'image/jpeg') return null
    // EXIF lives in the first segments; 128 KB is far more than enough and avoids reading a 10 MB photo.
    return parseExifGps(await file.slice(0, 131072).arrayBuffer())
}
