import {describe, expect, it} from 'vitest'
import {parseExif, parseExifGps} from '../exifGps'

/** Build a JPEG with an Exif APP1 holding only a GPS IFD. */
function jpegWithGps(opts: {
    little?: boolean; latRef?: string; lonRef?: string; lat?: [number, number, number]; lon?: [number, number, number]
    den?: number
}): ArrayBuffer {
    const little = opts.little ?? false
    const lat = opts.lat ?? [38, 42, 0]
    const lon = opts.lon ?? [9, 8, 0]
    const den = opts.den ?? 1
    const buf = new ArrayBuffer(220)
    const v = new DataView(buf)
    let p = 0
    v.setUint16(p, 0xffd8); p += 2
    v.setUint16(p, 0xffe1); p += 2
    v.setUint16(p, 150); p += 2
    v.setUint32(p, 0x45786966); p += 4
    v.setUint16(p, 0); p += 2
    const t = p // TIFF base
    v.setUint16(t, little ? 0x4949 : 0x4d4d)
    v.setUint16(t + 2, 42, little)
    v.setUint32(t + 4, 8, little)
    // IFD0: one entry (GPS pointer) at t+8
    v.setUint16(t + 8, 1, little)
    v.setUint16(t + 10, 0x8825, little); v.setUint16(t + 12, 4, little); v.setUint32(t + 14, 1, little)
    v.setUint32(t + 18, 26, little) // GPS IFD at t+26
    v.setUint32(t + 22, 0, little)
    // GPS IFD: 4 entries
    const g = t + 26
    v.setUint16(g, 4, little)
    const entry = (i: number, tag: number, type: number, count: number) => {
        const o = g + 2 + i * 12
        v.setUint16(o, tag, little); v.setUint16(o + 2, type, little); v.setUint32(o + 4, count, little)
        return o
    }
    let e = entry(0, 1, 2, 2); v.setUint8(e + 8, (opts.latRef ?? 'N').charCodeAt(0))
    e = entry(1, 2, 5, 3); v.setUint32(e + 8, 100, little) // data offset relative to tiff
    e = entry(2, 3, 2, 2); v.setUint8(e + 8, (opts.lonRef ?? 'E').charCodeAt(0))
    e = entry(3, 4, 5, 3); v.setUint32(e + 8, 124, little)
    const putRat = (base: number, vals: [number, number, number]) =>
        vals.forEach((n, i) => { v.setUint32(t + base + i * 8, n * den, little); v.setUint32(t + base + i * 8 + 4, den, little) })
    putRat(100, lat)
    putRat(124, lon)
    return buf
}

describe('parseExifGps', () => {
    it('reads big-endian GPS (N/E)', () => {
        const r = parseExifGps(jpegWithGps({}))
        expect(r!.latitude).toBeCloseTo(38.7, 5)
        expect(r!.longitude).toBeCloseTo(9.1333, 3)
    })

    it('reads little-endian GPS', () => {
        const r = parseExifGps(jpegWithGps({little: true}))
        expect(r!.latitude).toBeCloseTo(38.7, 5)
    })

    it('applies S and W references', () => {
        const r = parseExifGps(jpegWithGps({latRef: 'S', lonRef: 'W'}))
        expect(r!.latitude).toBeLessThan(0)
        expect(r!.longitude).toBeLessThan(0)
    })

    it('handles rationals with a denominator', () => {
        const r = parseExifGps(jpegWithGps({den: 1000}))
        expect(r!.latitude).toBeCloseTo(38.7, 5)
    })

    it('treats 0/0 as no fix', () => {
        expect(parseExifGps(jpegWithGps({lat: [0, 0, 0], lon: [0, 0, 0]}))).toBeNull()
    })

    it('returns null for non-JPEG, truncated and zero-denominator input', () => {
        expect(parseExifGps(new ArrayBuffer(0))).toBeNull()
        expect(parseExifGps(new Uint8Array([1, 2, 3, 4, 5]).buffer)).toBeNull()
        expect(parseExifGps(jpegWithGps({}).slice(0, 40))).toBeNull()
        expect(parseExifGps(jpegWithGps({den: 0}))).toBeNull()
    })
})

/** A JPEG whose IFD0 carries DateTime (0x0132) and, optionally, an Exif sub-IFD with DateTimeOriginal. */
function jpegWithDates(opts: { dateTime?: string; original?: string }): ArrayBuffer {
    const buf = new ArrayBuffer(220)
    const v = new DataView(buf)
    let p = 0
    v.setUint16(p, 0xffd8); p += 2
    v.setUint16(p, 0xffe1); p += 2
    v.setUint16(p, 200); p += 2
    v.setUint32(p, 0x45786966); p += 4
    v.setUint16(p, 0); p += 2
    const t = p
    v.setUint16(t, 0x4d4d); v.setUint16(t + 2, 42); v.setUint32(t + 4, 8)
    const entries = (opts.dateTime ? 1 : 0) + (opts.original ? 1 : 0)
    v.setUint16(t + 8, entries)
    let o = t + 10
    const text = (at: number, str: string) => [...str].forEach((c, i) => v.setUint8(t + at + i, c.charCodeAt(0)))
    if (opts.original) {
        v.setUint16(o, 0x8769); v.setUint16(o + 2, 4); v.setUint32(o + 4, 1); v.setUint32(o + 8, 50); o += 12
        v.setUint16(t + 50, 1)
        v.setUint16(t + 52, 0x9003); v.setUint16(t + 54, 2); v.setUint32(t + 56, 20); v.setUint32(t + 60, 130)
        text(130, opts.original + '\0')
    }
    if (opts.dateTime) {
        v.setUint16(o, 0x0132); v.setUint16(o + 2, 2); v.setUint32(o + 4, 20); v.setUint32(o + 8, 100)
        text(100, opts.dateTime + '\0')
    }
    return buf
}

describe('parseExif dates', () => {
    it('reads DateTimeOriginal as a YYYY-MM-DD day', () => {
        expect(parseExif(jpegWithDates({original: '2024:08:15 14:03:22'})).takenOn).toBe('2024-08-15')
    })

    it('prefers DateTimeOriginal over the file DateTime', () => {
        const r = parseExif(jpegWithDates({original: '2024:08:15 14:03:22', dateTime: '2025:01:02 10:00:00'}))
        expect(r.takenOn).toBe('2024-08-15')
    })

    it('falls back to DateTime in IFD0', () => {
        expect(parseExif(jpegWithDates({dateTime: '2023:12:24 18:00:00'})).takenOn).toBe('2023-12-24')
    })

    it('ignores the zero placeholder date', () => {
        expect(parseExif(jpegWithDates({dateTime: '0000:00:00 00:00:00'})).takenOn).toBeNull()
    })

    it('returns no date for a photo without one, and still reads the GPS', () => {
        const r = parseExif(jpegWithGps({}))
        expect(r.takenOn).toBeNull()
        expect(r.gps!.latitude).toBeCloseTo(38.7, 5)
    })

    it('never throws on garbage', () => {
        expect(parseExif(new ArrayBuffer(3))).toEqual({gps: null, takenOn: null})
    })
})
