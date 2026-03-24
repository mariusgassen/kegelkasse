/**
 * Unit tests for the Vollmer bowling display recognition engine.
 *
 * All tests are deterministic — no camera required. We synthesise
 * ImageData buffers with specific pixel patterns and verify that
 * readFrame() decodes them correctly.
 */
import {describe, expect, it} from 'vitest'
import {
    DEFAULT_CALIBRATION,
    PIN_POSITIONS,
    readFrame,
    type CalibrationData,
    type FrameReading,
} from '../cameraEngine'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fill a rectangle in an RGBA Uint8ClampedArray with a given colour. */
function fillRect(
    data: Uint8ClampedArray,
    w: number,
    h: number,
    rx: number, ry: number, rw: number, rh: number,
    r: number, g: number, b: number,
) {
    const x0 = Math.max(0, Math.floor(rx * w))
    const y0 = Math.max(0, Math.floor(ry * h))
    const x1 = Math.min(w, Math.ceil((rx + rw) * w))
    const y1 = Math.min(h, Math.ceil((ry + rh) * h))
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const idx = (y * w + x) * 4
            data[idx] = r
            data[idx + 1] = g
            data[idx + 2] = b
            data[idx + 3] = 255
        }
    }
}

/** Create a blank (all-black) ImageData of the given size. */
function blankFrame(w = 200, h = 200): ImageData {
    return new ImageData(new Uint8ClampedArray(w * h * 4), w, h)
}

// 7-segment bit patterns for each digit (bit 6=a … bit 0=g)
const SEG_PATTERNS: Record<number, number> = {
    0: 0b1111110, 1: 0b0110000, 2: 0b1101101, 3: 0b1111001,
    4: 0b0110011, 5: 0b1011011, 6: 0b1011111, 7: 0b1110000,
    8: 0b1111111, 9: 0b1111011,
}

// Relative segment rectangles [x0,y0,x1,y1] matching SEG_RECTS in cameraEngine.ts
const SEG_RECTS: [number, number, number, number][] = [
    [0.15, 0.02, 0.85, 0.18],  // a
    [0.78, 0.07, 0.98, 0.47],  // b
    [0.78, 0.53, 0.98, 0.93],  // c
    [0.15, 0.82, 0.85, 0.98],  // d
    [0.02, 0.53, 0.22, 0.93],  // e
    [0.02, 0.07, 0.22, 0.47],  // f
    [0.15, 0.42, 0.85, 0.58],  // g
]

/**
 * Paint a single 7-segment digit into the frame using bright green pixels
 * for active segments and black for inactive ones.
 */
function paintDigit(
    data: Uint8ClampedArray,
    w: number, h: number,
    dx: number, dy: number, dw: number, dh: number,
    digit: number,
    brightness = 200,
) {
    const pattern = SEG_PATTERNS[digit]
    for (let s = 0; s < 7; s++) {
        const [sx0, sy0, sx1, sy1] = SEG_RECTS[s]
        const active = !!(pattern & (1 << (6 - s)))
        if (active) {
            fillRect(data, w, h,
                dx + sx0 * dw, dy + sy0 * dh,
                (sx1 - sx0) * dw, (sy1 - sy0) * dh,
                0, brightness, 0,
            )
        }
    }
}

/** Build a calibration with a single 1-digit display on the left region. */
function singleDigitCal(brightness = 60): CalibrationData {
    return {
        ...DEFAULT_CALIBRATION,
        brightness,
        // Entire display = entire frame region, single digit
        displayLeft: {x: 0.0, y: 0.0, w: 1.0, h: 1.0, digits: 1},
        // Disable other displays (point off-screen)
        displayMiddle: {x: 2.0, y: 2.0, w: 0.1, h: 0.1, digits: 1},
        displayRight: {x: 2.0, y: 2.0, w: 0.1, h: 0.1, digits: 2},
        // Disable pin area
        pinArea: {x: 2.0, y: 2.0, w: 0.1, h: 0.1},
        lampRed: {x: 2.0, y: 2.0, w: 0.01, h: 0.01},
        lampGreen: {x: 2.0, y: 2.0, w: 0.01, h: 0.01},
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PIN_POSITIONS', () => {
    it('has exactly 9 pins', () => {
        expect(PIN_POSITIONS).toHaveLength(9)
    })

    it('all positions are within [0,1]', () => {
        for (const [cx, cy] of PIN_POSITIONS) {
            expect(cx).toBeGreaterThanOrEqual(0)
            expect(cx).toBeLessThanOrEqual(1)
            expect(cy).toBeGreaterThanOrEqual(0)
            expect(cy).toBeLessThanOrEqual(1)
        }
    })

    it('König (pin 9) is at back-center (top, x≈0.5, y small)', () => {
        const [cx, cy] = PIN_POSITIONS[0]
        expect(cx).toBeCloseTo(0.5, 1)
        expect(cy).toBeLessThan(0.2)
    })

    it('pin 1 (front center) is at bottom', () => {
        const [cx, cy] = PIN_POSITIONS[8]
        expect(cx).toBeCloseTo(0.5, 1)
        expect(cy).toBeGreaterThan(0.8)
    })
})

describe('DEFAULT_CALIBRATION', () => {
    it('has version 2', () => {
        expect(DEFAULT_CALIBRATION.version).toBe(2)
    })

    it('all ROIs have positive width and height', () => {
        const {displayLeft, displayMiddle, displayRight, pinArea, lampRed, lampGreen} = DEFAULT_CALIBRATION
        for (const roi of [displayLeft, displayMiddle, displayRight, pinArea, lampRed, lampGreen]) {
            expect(roi.w).toBeGreaterThan(0)
            expect(roi.h).toBeGreaterThan(0)
        }
    })
})

describe('readFrame — blank frame', () => {
    it('returns null for all displays on a fully dark frame', () => {
        const frame = blankFrame(100, 100)
        const result = readFrame(frame, DEFAULT_CALIBRATION)
        // All displays unreadable on a black frame
        expect(result.throwNum).toBeNull()
        expect(result.throwPins).toBeNull()
        expect(result.cumulative).toBeNull()
    })

    it('returns all pins unlit (not fallen) on a dark frame', () => {
        const frame = blankFrame(100, 100)
        const result = readFrame(frame, DEFAULT_CALIBRATION)
        expect(result.pinStates).toHaveLength(9)
        result.pinStates.forEach(state => expect(state).toBe(false))
    })

    it('returns lamps off on a dark frame', () => {
        const frame = blankFrame(100, 100)
        const result = readFrame(frame, DEFAULT_CALIBRATION)
        expect(result.lampRed).toBe(false)
        expect(result.lampGreen).toBe(false)
    })
})

describe('readFrame — digit recognition', () => {
    // Test each digit 0-9
    for (const digit of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
        it(`recognises digit ${digit}`, () => {
            const W = 200, H = 200
            const frame = blankFrame(W, H)
            const cal = singleDigitCal(60)

            // Paint the digit into the full frame (display covers entire frame)
            paintDigit(frame.data, W, H, 0, 0, 1.0, 1.0, digit, 200)

            const result: FrameReading = readFrame(frame, cal)
            expect(result.throwNum).toBe(digit)
        })
    }
})

describe('readFrame — pin states', () => {
    it('detects all 9 pins as fallen when all globes are bright green', () => {
        const W = 200, H = 200
        const frame = blankFrame(W, H)
        const cal: CalibrationData = {
            ...DEFAULT_CALIBRATION,
            brightness: 60,
            // Disable displays
            displayLeft: {x: 2, y: 2, w: 0.1, h: 0.1, digits: 1},
            displayMiddle: {x: 2, y: 2, w: 0.1, h: 0.1, digits: 1},
            displayRight: {x: 2, y: 2, w: 0.1, h: 0.1, digits: 2},
            // Pin area covers the whole frame
            pinArea: {x: 0, y: 0, w: 1, h: 1},
            lampRed: {x: 2, y: 2, w: 0.01, h: 0.01},
            lampGreen: {x: 2, y: 2, w: 0.01, h: 0.01},
        }

        // Light up all pin positions
        const globeR = Math.min(cal.pinArea.w, cal.pinArea.h) * 0.05
        for (const [px, py] of PIN_POSITIONS) {
            const cx = cal.pinArea.x + px * cal.pinArea.w
            const cy = cal.pinArea.y + py * cal.pinArea.h
            fillRect(frame.data, W, H, cx - globeR, cy - globeR, globeR * 2, globeR * 2, 0, 200, 0)
        }

        const result = readFrame(frame, cal)
        expect(result.pinStates).toHaveLength(9)
        result.pinStates.forEach((fallen, i) => expect(fallen).toBe(true))
    })

    it('detects individual pin as fallen when only that globe is lit', () => {
        const W = 300, H = 300
        const cal: CalibrationData = {
            ...DEFAULT_CALIBRATION,
            brightness: 60,
            displayLeft: {x: 2, y: 2, w: 0.1, h: 0.1, digits: 1},
            displayMiddle: {x: 2, y: 2, w: 0.1, h: 0.1, digits: 1},
            displayRight: {x: 2, y: 2, w: 0.1, h: 0.1, digits: 2},
            pinArea: {x: 0, y: 0, w: 1, h: 1},
            lampRed: {x: 2, y: 2, w: 0.01, h: 0.01},
            lampGreen: {x: 2, y: 2, w: 0.01, h: 0.01},
        }

        const globeR = Math.min(cal.pinArea.w, cal.pinArea.h) * 0.05

        // Only light pin index 4 (middle pin)
        for (let i = 0; i < PIN_POSITIONS.length; i++) {
            const frame = blankFrame(W, H)
            const [px, py] = PIN_POSITIONS[i]
            const cx = cal.pinArea.x + px * cal.pinArea.w
            const cy = cal.pinArea.y + py * cal.pinArea.h
            fillRect(frame.data, W, H, cx - globeR, cy - globeR, globeR * 2, globeR * 2, 0, 200, 0)

            const result = readFrame(frame, cal)
            result.pinStates.forEach((fallen, j) => {
                expect(fallen).toBe(j === i)
            })
        }
    })
})

describe('readFrame — lamp detection', () => {
    it('detects red lamp when red lamp ROI has bright red pixels', () => {
        const W = 200, H = 200
        const frame = blankFrame(W, H)
        const cal = {...DEFAULT_CALIBRATION, brightness: 60, redness: 80}

        fillRect(frame.data, W, H,
            cal.lampRed.x, cal.lampRed.y, cal.lampRed.w, cal.lampRed.h,
            200, 0, 0)

        const result = readFrame(frame, cal)
        expect(result.lampRed).toBe(true)
        expect(result.lampGreen).toBe(false)
    })

    it('detects green lamp when green lamp ROI has bright green pixels', () => {
        const W = 200, H = 200
        const frame = blankFrame(W, H)
        const cal = {...DEFAULT_CALIBRATION, brightness: 60, redness: 80}

        fillRect(frame.data, W, H,
            cal.lampGreen.x, cal.lampGreen.y, cal.lampGreen.w, cal.lampGreen.h,
            0, 200, 0)

        const result = readFrame(frame, cal)
        expect(result.lampGreen).toBe(true)
        expect(result.lampRed).toBe(false)
    })
})

describe('readFrame — threshold sensitivity', () => {
    it('returns null for dim green (below threshold)', () => {
        const W = 200, H = 200
        const frame = blankFrame(W, H)
        const cal = singleDigitCal(100)  // threshold = 100

        // Paint digit 8 with dim green (below threshold)
        paintDigit(frame.data, W, H, 0, 0, 1.0, 1.0, 8, 50)

        const result = readFrame(frame, cal)
        expect(result.throwNum).toBeNull()
    })

    it('returns digit for green above threshold', () => {
        const W = 200, H = 200
        const frame = blankFrame(W, H)
        const cal = singleDigitCal(60)

        paintDigit(frame.data, W, H, 0, 0, 1.0, 1.0, 8, 200)

        const result = readFrame(frame, cal)
        expect(result.throwNum).toBe(8)
    })
})

describe('readFrame — FrameReading shape', () => {
    it('always returns a complete FrameReading object', () => {
        const frame = blankFrame(50, 50)
        const result = readFrame(frame, DEFAULT_CALIBRATION)

        expect(result).toHaveProperty('throwNum')
        expect(result).toHaveProperty('throwPins')
        expect(result).toHaveProperty('cumulative')
        expect(result).toHaveProperty('pinStates')
        expect(result).toHaveProperty('lampRed')
        expect(result).toHaveProperty('lampGreen')
        expect(Array.isArray(result.pinStates)).toBe(true)
        expect(result.pinStates).toHaveLength(9)
        expect(typeof result.lampRed).toBe('boolean')
        expect(typeof result.lampGreen).toBe('boolean')
    })
})
