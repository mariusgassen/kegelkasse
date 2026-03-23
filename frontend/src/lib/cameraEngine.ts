/**
 * Vollmer bowling display recognition engine.
 *
 * Reads three green 7-segment displays and 9 pin globes from a video frame:
 *   Display Left   — throw number (event trigger)
 *   Display Middle — pins knocked this throw (primary score source)
 *   Display Right  — cumulative score (consistency check)
 *   Pin Globes     — 9 positions; lit = pin fallen, dark = pin standing
 *
 * All recognition is deterministic (no ML). Each segment ROI is sampled
 * for average green-channel brightness and compared to a threshold.
 */

// ── 7-Segment encoding ────────────────────────────────────────────────────────
// Bit positions: 6=a(top) 5=b(top-right) 4=c(bot-right) 3=d(bottom)
//                2=e(bot-left) 1=f(top-left) 0=g(middle)
//
//   aaa
//  f   b
//  f   b
//   ggg
//  e   c
//  e   c
//   ddd
const SEG_TO_DIGIT: Record<number, number> = {
    0b1111110: 0,
    0b0110000: 1,
    0b1101101: 2,
    0b1111001: 3,
    0b0110011: 4,
    0b1011011: 5,
    0b1011111: 6,
    0b1110000: 7,
    0b1111111: 8,
    0b1111011: 9,
}

// Relative positions [x0, y0, x1, y1] of each segment within a digit bbox.
// Order: a, b, c, d, e, f, g (matches bit 6→0 in SEG_TO_DIGIT).
const SEG_RECTS: [number, number, number, number][] = [
    [0.15, 0.02, 0.85, 0.18],  // a: top
    [0.78, 0.07, 0.98, 0.47],  // b: top-right
    [0.78, 0.53, 0.98, 0.93],  // c: bot-right
    [0.15, 0.82, 0.85, 0.98],  // d: bottom
    [0.02, 0.53, 0.22, 0.93],  // e: bot-left
    [0.02, 0.07, 0.22, 0.47],  // f: top-left
    [0.15, 0.42, 0.85, 0.58],  // g: middle
]

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DisplayROI {
    x: number       // left edge, 0–1 relative to frame width
    y: number       // top edge, 0–1 relative to frame height
    w: number       // width
    h: number       // height
    digits: 1 | 2 | 3
}

export interface PinAreaROI {
    x: number
    y: number
    w: number
    h: number
}

export interface LampROI {
    x: number
    y: number
    w: number
    h: number
}

export interface CalibrationData {
    displayLeft: DisplayROI    // throw number display
    displayMiddle: DisplayROI  // pins-this-throw display
    displayRight: DisplayROI   // cumulative score display
    pinArea: PinAreaROI        // bounding box covering all 9 pin globes
    lampRed: LampROI           // red lamp: Bande getroffen (0 Punkte)
    lampGreen: LampROI         // green lamp: Kegel gestellt / Bahn bereit
    brightness: number         // green-channel threshold 0–255 (default 60)
    redness: number            // red-channel threshold for red lamp (default 80)
    version: 2
}

export const DEFAULT_CALIBRATION: CalibrationData = {
    displayLeft:   {x: 0.05, y: 0.55, w: 0.18, h: 0.25, digits: 1},
    displayMiddle: {x: 0.35, y: 0.55, w: 0.28, h: 0.25, digits: 1},
    displayRight:  {x: 0.67, y: 0.55, w: 0.30, h: 0.25, digits: 2},
    pinArea:       {x: 0.10, y: 0.05, w: 0.80, h: 0.45},
    lampRed:       {x: 0.02, y: 0.55, w: 0.04, h: 0.08},
    lampGreen:     {x: 0.02, y: 0.45, w: 0.04, h: 0.08},
    brightness: 60,
    redness: 80,
    version: 2,
}

export interface FrameReading {
    throwNum: number | null
    throwPins: number | null
    cumulative: number | null
    pinStates: boolean[]  // 9 elements; true = fallen (globe lit)
    lampRed: boolean      // true = Bande getroffen (0 Punkte)
    lampGreen: boolean    // true = Kegel gestellt / Bahn bereit
}

// Vollmer 9-pin globe positions as [cx, cy] relative to pinArea bbox.
// True Raute/diamond layout (top→bottom): 1 – 2 – 3 – 2 – 1
// Pin 9 (König) is back-center; Pin 1 is front-center.
export const PIN_POSITIONS: [number, number][] = [
    [0.50, 0.10],                                              // back center (König / Pin 9)
    [0.30, 0.30], [0.70, 0.30],                               // row 4: pins 7, 8
    [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],               // middle row: pins 4, 5, 6
    [0.30, 0.70], [0.70, 0.70],                               // row 2: pins 2, 3
    [0.50, 0.90],                                              // front center (Pin 1)
]

// ── Pixel helpers ─────────────────────────────────────────────────────────────

/** Average red-channel brightness over a rectangle (coords in 0–1 space). */
function avgRed(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    rx: number, ry: number, rw: number, rh: number,
): number {
    const x0 = Math.max(0, Math.floor(rx * imgW))
    const y0 = Math.max(0, Math.floor(ry * imgH))
    const x1 = Math.min(imgW, Math.ceil((rx + rw) * imgW))
    const y1 = Math.min(imgH, Math.ceil((ry + rh) * imgH))
    if (x1 <= x0 || y1 <= y0) return 0
    let sum = 0
    let count = 0
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            sum += data[(y * imgW + x) * 4 + 0]  // red channel
            count++
        }
    }
    return count > 0 ? sum / count : 0
}

/** Average green-channel brightness over a rectangle (coords in 0–1 space). */
function avgGreen(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    rx: number, ry: number, rw: number, rh: number,
): number {
    const x0 = Math.max(0, Math.floor(rx * imgW))
    const y0 = Math.max(0, Math.floor(ry * imgH))
    const x1 = Math.min(imgW, Math.ceil((rx + rw) * imgW))
    const y1 = Math.min(imgH, Math.ceil((ry + rh) * imgH))
    if (x1 <= x0 || y1 <= y0) return 0
    let sum = 0
    let count = 0
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            sum += data[(y * imgW + x) * 4 + 1]  // green channel
            count++
        }
    }
    return count > 0 ? sum / count : 0
}

// ── Recognition ───────────────────────────────────────────────────────────────

function readDigit(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    dx: number, dy: number, dw: number, dh: number,
    threshold: number,
): number | null {
    let mask = 0
    for (let s = 0; s < 7; s++) {
        const [sx0, sy0, sx1, sy1] = SEG_RECTS[s]
        const bright = avgGreen(
            data, imgW, imgH,
            dx + sx0 * dw, dy + sy0 * dh,
            (sx1 - sx0) * dw, (sy1 - sy0) * dh,
        )
        if (bright > threshold) mask |= (1 << (6 - s))
    }
    return SEG_TO_DIGIT[mask] ?? null
}

function readDisplay(
    data: Uint8ClampedArray,
    imgW: number,
    imgH: number,
    roi: DisplayROI,
    threshold: number,
): number | null {
    const digitW = roi.w / roi.digits
    let result = 0
    let hasDigit = false
    for (let d = 0; d < roi.digits; d++) {
        const digit = readDigit(
            data, imgW, imgH,
            roi.x + d * digitW, roi.y, digitW, roi.h,
            threshold,
        )
        if (digit === null) {
            if (hasDigit) return null  // gap in the middle → unreadable
            continue                   // leading blank is fine (e.g. " 9")
        }
        result = result * 10 + digit
        hasDigit = true
    }
    return hasDigit ? result : null
}

export function readFrame(imageData: ImageData, cal: CalibrationData): FrameReading {
    const {data, width: imgW, height: imgH} = imageData
    const t = cal.brightness
    const rt = cal.redness ?? 80

    const throwNum = readDisplay(data, imgW, imgH, cal.displayLeft, t)
    const throwPins = readDisplay(data, imgW, imgH, cal.displayMiddle, t)
    const cumulative = readDisplay(data, imgW, imgH, cal.displayRight, t)

    const globeR = Math.min(cal.pinArea.w, cal.pinArea.h) * 0.05
    const pinStates: boolean[] = PIN_POSITIONS.map(([px, py]) => {
        const cx = cal.pinArea.x + px * cal.pinArea.w
        const cy = cal.pinArea.y + py * cal.pinArea.h
        const bright = avgGreen(data, imgW, imgH, cx - globeR, cy - globeR, globeR * 2, globeR * 2)
        return bright > t  // lit = fallen
    })

    // Lamp detection: red lamp = Bande (gutter), green lamp = lane ready
    const lr = cal.lampRed ?? {x: 0.02, y: 0.55, w: 0.04, h: 0.08}
    const lg = cal.lampGreen ?? {x: 0.02, y: 0.45, w: 0.04, h: 0.08}
    const lampRed = avgRed(data, imgW, imgH, lr.x, lr.y, lr.w, lr.h) > rt
    const lampGreen = avgGreen(data, imgW, imgH, lg.x, lg.y, lg.w, lg.h) > t

    return {throwNum, throwPins, cumulative, pinStates, lampRed, lampGreen}
}
