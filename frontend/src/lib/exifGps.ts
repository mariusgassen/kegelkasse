/**
 * Minimal EXIF reader: pulls the GPS position and the capture date out of a JPEG so a sticker
 * photo taken on the spot can pre-fill its map pin, place name and date. No dependency — only the handful of tags needed are parsed, and every
 * malformed input returns `null` instead of throwing (EXIF in the wild is routinely broken).
 */
export interface GpsPoint { latitude: number; longitude: number }
export interface ExifMeta { gps: GpsPoint | null; /** Capture day as YYYY-MM-DD. */ takenOn: string | null }

const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME = 0x0132
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_DATETIME_DIGITIZED = 0x9004

const TAG_GPS_IFD = 0x8825
const TAG_LAT_REF = 1
const TAG_LAT = 2
const TAG_LON_REF = 3
const TAG_LON = 4

// Bytes per element for the TIFF field types we may meet (RATIONAL = 5 is the one we need).
const TYPE_SIZE: Record<number, number> = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}

export function parseExif(buffer: ArrayBuffer): ExifMeta {
    try {
        return read(new DataView(buffer))
    } catch {
        return {gps: null, takenOn: null}
    }
}

export function parseExifGps(buffer: ArrayBuffer): GpsPoint | null {
    return parseExif(buffer).gps
}

const NONE: ExifMeta = {gps: null, takenOn: null}

function read(v: DataView): ExifMeta {
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return NONE
    // Walk the JPEG marker segments until the Exif APP1.
    let off = 2
    let tiff = -1
    while (off + 4 <= v.byteLength) {
        if (v.getUint8(off) !== 0xff) return NONE
        const marker = v.getUint8(off + 1)
        if (marker === 0xda || marker === 0xd9) break // start of scan / end of image: no more metadata
        const len = v.getUint16(off + 2)
        if (marker === 0xe1 && v.getUint32(off + 4) === 0x45786966 /* "Exif" */ && v.getUint16(off + 8) === 0) {
            tiff = off + 10
            break
        }
        off += 2 + len
    }
    if (tiff < 0) return NONE

    const little = v.getUint16(tiff) === 0x4949
    if (!little && v.getUint16(tiff) !== 0x4d4d) return NONE
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

    const ifd0 = entries(tiff + u32(tiff + 4))

    /** "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DD" (null for the all-zero placeholder cameras write). */
    function dateTag(map: Map<number, number>, tag: number): string | null {
        const e = map.get(tag)
        if (e === undefined || u32(e + 4) < 10) return null
        const o = valueOffset(e)
        let txt = ''
        for (let i = 0; i < 10; i++) txt += String.fromCharCode(v.getUint8(o + i))
        const m = /^(\d{4}):(\d{2}):(\d{2})$/.exec(txt)
        if (!m || m[1] === '0000' || m[2] === '00' || m[3] === '00') return null
        return `${m[1]}-${m[2]}-${m[3]}`
    }

    let takenOn: string | null = null
    try {
        const exifPtr = ifd0.get(TAG_EXIF_IFD)
        const sub = exifPtr === undefined ? null : entries(tiff + u32(exifPtr + 8))
        takenOn = (sub && (dateTag(sub, TAG_DATETIME_ORIGINAL) ?? dateTag(sub, TAG_DATETIME_DIGITIZED)))
            ?? dateTag(ifd0, TAG_DATETIME)
    } catch { /* a broken date must not cost us the GPS position */ }

    const gpsPtr = ifd0.get(TAG_GPS_IFD)
    if (gpsPtr === undefined) return {gps: null, takenOn}
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
    if (lat === null || lon === null) return {gps: null, takenOn}
    const latitude = ref(TAG_LAT_REF) === 'S' ? -lat : lat
    const longitude = ref(TAG_LON_REF) === 'W' ? -lon : lon
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return {gps: null, takenOn}
    // (0, 0) is what many cameras write when they had no fix; treat it as "no location".
    if (latitude === 0 && longitude === 0) return {gps: null, takenOn}
    return {gps: {latitude, longitude}, takenOn}
}

export async function readFileExif(file: File): Promise<ExifMeta> {
    if (file.type !== 'image/jpeg') return NONE
    // EXIF lives in the first segments; 128 KB is far more than enough and avoids reading a 10 MB photo.
    return parseExif(await file.slice(0, 131072).arrayBuffer())
}

export async function readFileGps(file: File): Promise<GpsPoint | null> {
    return (await readFileExif(file)).gps
}
