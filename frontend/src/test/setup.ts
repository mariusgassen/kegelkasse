import '@testing-library/jest-dom'
import {vi} from 'vitest'
import {cloneElement} from 'react'

// jsdom has no layout, so Recharts' ResponsiveContainer would measure 0×0 and draw nothing — hand its
// child a fixed size instead. A test that needs different behaviour can still vi.mock('recharts') itself.
vi.mock('recharts', async () => {
    const actual = await vi.importActual<typeof import('recharts')>('recharts')
    return {
        ...actual,
        ResponsiveContainer: ({children, height}: { children: React.ReactElement<Record<string, unknown>>; height?: number | string }) =>
            cloneElement(children, {width: 400, height: typeof height === 'number' ? height : 200}),
    }
})

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
