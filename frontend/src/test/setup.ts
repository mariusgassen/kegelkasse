import '@testing-library/jest-dom'

// jsdom does not ship ImageData — provide a minimal polyfill for canvas-based tests.
if (typeof ImageData === 'undefined') {
    // @ts-expect-error — polyfill for jsdom environment
    globalThis.ImageData = class ImageData {
        readonly data: Uint8ClampedArray
        readonly width: number
        readonly height: number
        constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
            if (dataOrWidth instanceof Uint8ClampedArray) {
                this.data = dataOrWidth
                this.width = widthOrHeight
                this.height = height ?? (dataOrWidth.length / 4 / widthOrHeight)
            } else {
                this.width = dataOrWidth
                this.height = widthOrHeight
                this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4)
            }
        }
    }
}
