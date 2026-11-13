/**
 * Loads the club's logo + brand colour for the PDF report. Forme embeds PNG/JPEG only, so the
 * logo is redrawn onto a canvas (this also converts SVG/WebP/GIF). Any failure just means the
 * report is built without a logo.
 */
import type {ReportBranding} from '@/lib/reportPdf'
import type {Club} from '@/types'

const MAX_EDGE = 400

export function scaleToFit(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
    const k = Math.min(1, max / Math.max(width, height))
    return {width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k))}
}

async function loadLogo(url: string): Promise<ReportBranding['logo']> {
    const res = await fetch(url)
    if (!res.ok) return null
    const objectUrl = URL.createObjectURL(await res.blob())
    try {
        const img = new Image()
        img.src = objectUrl
        await img.decode()
        const {width, height} = scaleToFit(img.naturalWidth || 256, img.naturalHeight || 256)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        return {src: canvas.toDataURL('image/png'), width, height}
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

export async function loadReportBranding(club: Club | undefined): Promise<ReportBranding> {
    const settings = club?.settings
    let logo: ReportBranding['logo'] = null
    if (settings?.logo_url) {
        try {
            logo = await loadLogo(settings.logo_url)
        } catch {
            logo = null
        }
    }
    return {color: settings?.primary_color ?? null, logo}
}
