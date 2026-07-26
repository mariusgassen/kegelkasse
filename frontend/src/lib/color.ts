/**
 * Hex <-> HSL conversion. Extracted from App.tsx so `lib/contrast.ts` can use it without
 * importing the app root (which would be a cycle: App -> contrast -> App).
 * App.tsx re-exports both for its existing consumers (ClubAdminPage's palette generator).
 */

export function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0
    const l = (max + min) / 2
    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break
            case g:
                h = ((b - r) / d + 2) / 6;
                break
            case b:
                h = ((r - g) / d + 4) / 6;
                break
        }
    }
    return [h * 360, s * 100, l * 100]
}

export function hslToHex(h: number, s: number, l: number): string {
    h /= 360;
    s /= 100;
    l /= 100
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    let r, g, b
    if (s === 0) {
        r = g = b = l
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3)
    }
    return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join('')
}
