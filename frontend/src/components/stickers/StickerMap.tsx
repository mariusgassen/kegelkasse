/**
 * World map for the sticker wall (Leaflet + CARTO tiles). Two modes share one component:
 *  - overview: one pin per place showing the newest photo (stickers within ~100 m collapse into one
 *    pin, numbered with how many photos are there); tapping it opens a popup with numbered previews
 *    that leads to the newest post;
 *  - picker: tap anywhere to drop a single pin (used by the post form).
 * Loaded lazily by the page so Leaflet stays out of the main bundle.
 */
import {useEffect, useRef, useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {thumbUrl} from '@/lib/mediaUrl.ts'
import type {MapStyle, Sticker} from '@/types.ts'
import {clusterByZoom, groupPhotos} from '@/lib/stickers.ts'

export const TILES = '/api/v1/stickers/tiles/{z}/{x}/{y}.png?r={r}'

export function tileUrl(style?: MapStyle | string): string {
    return style && style !== 'voyager' ? `${TILES}&style=${encodeURIComponent(style)}` : TILES
}

export interface LatLng { latitude: number; longitude: number }

interface Props {
    stickers?: Sticker[]
    /** Overview: called with the newest sticker id of the tapped pin. */
    onOpen?: (id: number) => void
    openLabel?: string
    /** Picker mode: current pin (or null) and change handler. */
    picked?: LatLng | null
    onPick?: (p: LatLng) => void
    attribution?: string
    mapStyle?: MapStyle | string
    className?: string
}

/** A pin drawn with theme tokens — a stock Leaflet marker image would ignore the club colours. */
function pinIcon(count: number): L.DivIcon {
    const badge = count > 1
        ? `<span style="position:absolute;top:-6px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;` +
          `background:var(--danger);color:var(--on-danger);font:700 12px/18px sans-serif;text-align:center">${count}</span>`
        : ''
    return L.divIcon({
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="position:relative;width:28px;height:28px;border-radius:50%;background:var(--accent);` +
              `border:3px solid var(--on-accent);box-shadow:0 1px 4px rgba(0,0,0,.5)">${badge}</div>`,
    })
}

/** A pin showing the newest photo at a place, numbered when there is more than one photo. */
function photoPinIcon(cover: string, count: number): L.DivIcon {
    const box = document.createElement('div')
    box.style.cssText = 'position:relative;width:48px;height:48px'
    const img = document.createElement('img')
    img.src = thumbUrl(cover, 240)
    img.decoding = 'async'
    img.alt = ''
    img.style.cssText = 'width:48px;height:48px;object-fit:cover;border-radius:12px;background:var(--surface);' +
        'border:3px solid var(--accent);box-shadow:0 1px 5px rgba(0,0,0,.55)'
    box.append(img)
    if (count > 1) {
        const badge = document.createElement('span')
        badge.textContent = String(count)
        badge.style.cssText = 'position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;' +
            'border-radius:10px;background:var(--accent);color:var(--on-accent);' +
            'font:700 12px/20px sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.5)'
        box.append(badge)
    }
    return L.divIcon({className: '', iconSize: [48, 48], iconAnchor: [24, 24], html: box})
}

/** Up to six numbered thumbnails for a pin's popup. */
function previewStrip(urls: string[]): HTMLElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;max-width:220px'
    urls.slice(0, 6).forEach((u, i) => {
        const cell = document.createElement('div')
        cell.style.cssText = 'position:relative;width:64px;height:64px'
        const im = document.createElement('img')
        im.src = thumbUrl(u, 240)
        im.loading = 'lazy'
        im.alt = ''
        im.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:8px'
        const n = document.createElement('span')
        n.textContent = String(i + 1)
        n.style.cssText = 'position:absolute;bottom:2px;right:2px;min-width:18px;padding:0 4px;border-radius:9px;' +
            'background:var(--accent);color:var(--on-accent);font:700 12px/18px sans-serif;text-align:center'
        cell.append(im)
        if (urls.length > 1) cell.append(n)
        row.append(cell)
    })
    return row
}

export default function StickerMap({stickers = [], onOpen, openLabel = '', picked, onPick, mapStyle = 'voyager', className}: Props) {
    const el = useRef<HTMLDivElement>(null)
    const map = useRef<L.Map | null>(null)
    const tileLayer = useRef<L.TileLayer | null>(null)
    const layer = useRef<L.LayerGroup | null>(null)
    // Latest callbacks, so the long-lived Leaflet handlers never go stale.
    const cb = useRef({onOpen, onPick})
    cb.current = {onOpen, onPick}
    const fitted = useRef(false)
    const [zoom, setZoom] = useState(2)
    const isClubTint = mapStyle === 'club_dark' || mapStyle === 'club_light'

    useEffect(() => {
        if (!el.current) return
        const m = L.map(el.current, {worldCopyJump: true, minZoom: 1, zoomControl: true, attributionControl: false}).setView([30, 10], 2)
        tileLayer.current = L.tileLayer(tileUrl(mapStyle), {maxZoom: 19}).addTo(m)
        layer.current = L.layerGroup().addTo(m)
        m.on('click', (e: L.LeafletMouseEvent) => cb.current.onPick?.({latitude: e.latlng.lat, longitude: e.latlng.lng}))
        m.on('zoomend', () => setZoom(m.getZoom()))
        map.current = m
        return () => { m.remove(); map.current = null; tileLayer.current = null; layer.current = null }
    }, [])

    useEffect(() => {
        tileLayer.current?.setUrl(tileUrl(mapStyle))
    }, [mapStyle])

    useEffect(() => {
        const m = map.current
        const g = layer.current
        if (!m || !g) return
        g.clearLayers()
        const bounds: L.LatLngTuple[] = []
        if (onPick) {
            if (picked) {
                L.marker([picked.latitude, picked.longitude], {icon: pinIcon(1)}).addTo(g)
                // Only recentre when the pin is far off-screen (e.g. set from the photo or GPS).
                if (!m.getBounds().contains([picked.latitude, picked.longitude])) {
                    m.setView([picked.latitude, picked.longitude], Math.max(m.getZoom(), 8))
                }
            }
            return
        }
        for (const grp of clusterByZoom(stickers, zoom)) {
            const pos: L.LatLngTuple = [grp.latitude, grp.longitude]
            bounds.push(pos)
            const photos = groupPhotos(grp)
            const marker = L.marker(pos, {icon: photoPinIcon(photos[0], photos.length), title: grp.place_name}).addTo(g)
            // A cluster of several places zooms in on its members instead of opening a popup.
            if (grp.places > 1 && zoom < 17) {
                marker.on('click', () => m.fitBounds(
                    L.latLngBounds(grp.stickers.map(s => [s.latitude, s.longitude] as L.LatLngTuple)),
                    {padding: [60, 60], maxZoom: 18}))
                continue
            }
            // Built from DOM nodes (not an HTML string): place names are user input.
            const box = document.createElement('div')
            const title = document.createElement('strong')
            title.textContent = grp.place_name
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.textContent = openLabel
            btn.style.cssText = 'display:block;margin-top:6px;padding:6px 10px;border-radius:8px;border:0;' +
                'background:var(--accent);color:var(--on-accent);font-weight:700'
            btn.onclick = () => cb.current.onOpen?.(grp.stickers[0].id)
            box.append(title, previewStrip(photos), btn)
            marker.bindPopup(box)
        }
        // Frame all pins once, the first time data arrives — not on every refetch.
        if (!fitted.current && bounds.length) {
            m.fitBounds(L.latLngBounds(bounds), {padding: [40, 40], maxZoom: 6})
            fitted.current = true
        }
    }, [stickers, picked, onPick, openLabel, zoom])

    return (
        <div data-no-ptr className={`${className ?? 'w-full h-72 rounded-xl overflow-hidden border border-line'} relative isolate`}>
            <div ref={el} className="w-full h-full" role="region" aria-label="map"/>
            {isClubTint && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                        zIndex: 250,
                        background: 'linear-gradient(135deg, var(--accent), var(--accent-2, var(--accent)))',
                        mixBlendMode: mapStyle === 'club_dark' ? 'color' : 'soft-light',
                        opacity: mapStyle === 'club_dark' ? 0.45 : 0.5,
                    }}
                />
            )}
        </div>
    )
}
