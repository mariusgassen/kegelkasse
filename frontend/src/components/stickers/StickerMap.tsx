/**
 * World map for the sticker wall (Leaflet + OpenStreetMap tiles). Two modes share one component:
 *  - overview: one pin per place (stickers within ~100 m collapse into a pin with a count),
 *    tapping a pin opens a popup that leads to the newest post there;
 *  - picker: tap anywhere to drop a single pin (used by the post form).
 * Loaded lazily by the page so Leaflet stays out of the main bundle.
 */
import {useEffect, useRef} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type {Sticker} from '@/types.ts'
import {groupByPlace} from '@/lib/stickers.ts'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export interface LatLng { latitude: number; longitude: number }

interface Props {
    stickers?: Sticker[]
    /** Overview: called with the newest sticker id of the tapped pin. */
    onOpen?: (id: number) => void
    openLabel?: string
    /** Picker mode: current pin (or null) and change handler. */
    picked?: LatLng | null
    onPick?: (p: LatLng) => void
    attribution: string
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

export default function StickerMap({stickers = [], onOpen, openLabel = '', picked, onPick, attribution, className}: Props) {
    const el = useRef<HTMLDivElement>(null)
    const map = useRef<L.Map | null>(null)
    const layer = useRef<L.LayerGroup | null>(null)
    // Latest callbacks, so the long-lived Leaflet handlers never go stale.
    const cb = useRef({onOpen, onPick})
    cb.current = {onOpen, onPick}
    const fitted = useRef(false)

    useEffect(() => {
        if (!el.current) return
        const m = L.map(el.current, {worldCopyJump: true, minZoom: 1, zoomControl: true}).setView([30, 10], 2)
        L.tileLayer(TILES, {maxZoom: 18, attribution}).addTo(m)
        layer.current = L.layerGroup().addTo(m)
        m.on('click', (e: L.LeafletMouseEvent) => cb.current.onPick?.({latitude: e.latlng.lat, longitude: e.latlng.lng}))
        map.current = m
        return () => { m.remove(); map.current = null; layer.current = null }
    }, [attribution])

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
        for (const grp of groupByPlace(stickers)) {
            const pos: L.LatLngTuple = [grp.latitude, grp.longitude]
            bounds.push(pos)
            const marker = L.marker(pos, {icon: pinIcon(grp.stickers.length), title: grp.place_name}).addTo(g)
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
            box.append(title, btn)
            marker.bindPopup(box)
        }
        // Frame all pins once, the first time data arrives — not on every refetch.
        if (!fitted.current && bounds.length) {
            m.fitBounds(L.latLngBounds(bounds), {padding: [40, 40], maxZoom: 6})
            fitted.current = true
        }
    }, [stickers, picked, onPick, openLabel])

    return <div ref={el} className={className ?? 'w-full h-72 rounded-xl overflow-hidden border border-line'}
                role="region" aria-label="map"/>
}
