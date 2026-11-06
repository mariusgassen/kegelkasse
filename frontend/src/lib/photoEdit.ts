/**
 * Basic photo editing for uploads: rotate in 90° steps, crop to a preset shape and zoom/pan inside
 * it. The maths is kept pure (and testable); `renderEdited` is the only part that needs a canvas.
 */
export type Aspect = 'original' | '1:1' | '4:3' | '3:4' | '16:9'
export const ASPECTS: Aspect[] = ['original', '1:1', '4:3', '3:4', '16:9']

export interface EditState {
    /** Clockwise, in degrees. */
    rotation: 0 | 90 | 180 | 270
    aspect: Aspect
    /** 1 = the whole frame, up to MAX_ZOOM. */
    zoom: number
    /** Crop-window position inside the leftover space, -1 (left/top) … 1 (right/bottom). */
    panX: number
    panY: number
}

export const MAX_ZOOM = 4
export const INITIAL_EDIT: EditState = {rotation: 0, aspect: 'original', zoom: 1, panX: 0, panY: 0}

export interface Rect { sx: number; sy: number; sw: number; sh: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function aspectRatio(aspect: Aspect, w: number, h: number): number {
    if (aspect === 'original') return w / h
    const [a, b] = aspect.split(':').map(Number)
    return a / b
}

/** Size of the image after rotating it. */
export function rotatedSize(w: number, h: number, rotation: number): {w: number; h: number} {
    return rotation === 90 || rotation === 270 ? {w: h, h: w} : {w, h}
}

/** The source rectangle (in the *rotated* image) that the crop window covers. */
export function cropRect(w: number, h: number, ratio: number, zoom: number, panX: number, panY: number): Rect {
    // Largest window of the wanted shape that fits, shrunk by the zoom.
    let cw = w
    let ch = w / ratio
    if (ch > h) { ch = h; cw = h * ratio }
    const z = clamp(zoom, 1, MAX_ZOOM)
    const sw = cw / z
    const sh = ch / z
    const sx = (w - sw) * (0.5 + clamp(panX, -1, 1) / 2)
    const sy = (h - sh) * (0.5 + clamp(panY, -1, 1) / 2)
    return {sx, sy, sw, sh}
}

/** Draws the edited image onto `canvas`, scaled so its longer side is at most `maxSide`. */
export function drawEdited(canvas: HTMLCanvasElement, img: CanvasImageSource & {width: number; height: number},
                           state: EditState, maxSide: number): void {
    const {w, h} = rotatedSize(img.width, img.height, state.rotation)
    const r = cropRect(w, h, aspectRatio(state.aspect, w, h), state.zoom, state.panX, state.panY)
    const scale = Math.min(1, maxSide / Math.max(r.sw, r.sh))
    canvas.width = Math.max(1, Math.round(r.sw * scale))
    canvas.height = Math.max(1, Math.round(r.sh * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.save()
    ctx.scale(scale, scale)
    ctx.translate(-r.sx, -r.sy)
    // Rotate the source about the origin of the rotated frame.
    ctx.translate(state.rotation === 90 || state.rotation === 180 ? w : 0,
                  state.rotation === 180 || state.rotation === 270 ? h : 0)
    ctx.rotate(state.rotation * Math.PI / 180)
    ctx.drawImage(img, 0, 0)
    ctx.restore()
}

export function renderEdited(img: CanvasImageSource & {width: number; height: number}, state: EditState,
                             maxSide = 2048): Promise<Blob> {
    const canvas = document.createElement('canvas')
    drawEdited(canvas, img, state, maxSide)
    return new Promise((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('encode failed')), 'image/jpeg', 0.9))
}
