import {describe, expect, it} from 'vitest'
import {clusterByZoom, groupByPlace, groupPhotos, matchesSticker, placeCount, posterNames} from '../stickers'
import {TILES} from '@/components/stickers/StickerMap.tsx'
import type {Sticker} from '@/types.ts'

const s = (id: number, lat: number, lon: number, place = 'X'): Sticker => ({
    id, media_url: '/u', media_urls: ['/u'], place_name: place, latitude: lat, longitude: lon, caption: null,
    stuck_on: null, created_by_name: null, created_at: null, can_edit: false,
})

describe('groupByPlace', () => {
    it('collapses nearby stickers and keeps order', () => {
        const g = groupByPlace([s(3, 38.7001, -9.1, 'Lisbon'), s(2, 38.7002, -9.1004), s(1, 10, 10)])
        expect(g).toHaveLength(2)
        expect(g[0].stickers.map(x => x.id)).toEqual([3, 2])
        expect(g[0].place_name).toBe('Lisbon')
    })
    it('counts distinct places and handles empty input', () => {
        expect(placeCount([])).toBe(0)
        expect(placeCount([s(1, 1, 1), s(2, 1, 1), s(3, 2, 2)])).toBe(2)
    })
})

describe('groupPhotos', () => {
    it('lists every photo at a pin, newest post first', () => {
        const a = {...s(2, 1, 1), media_urls: ['/a1', '/a2']}
        const b = {...s(1, 1, 1), media_urls: ['/b1']}
        expect(groupPhotos(groupByPlace([a, b])[0])).toEqual(['/a1', '/a2', '/b1'])
    })
})

describe('clusterByZoom', () => {
    const lisbon = s(3, 38.72, -9.14, 'Lisbon')
    const porto = s(2, 41.15, -8.61, 'Porto')
    const rome = s(1, 41.9, 12.5, 'Rome')

    it('merges neighbouring places when zoomed out and splits them when zoomed in', () => {
        const out = clusterByZoom([lisbon, porto, rome], 1)
        expect(out).toHaveLength(1)
        expect(out[0].places).toBe(3)
        expect(out[0].stickers.map(x => x.id)).toEqual([3, 2, 1])
        expect(out[0].place_name).toBe('Lisbon +2')
        expect(clusterByZoom([lisbon, porto, rome], 10)).toHaveLength(3)
    })
    it('keeps same-place stickers together at every zoom and positions at the centroid', () => {
        const a = s(2, 10, 10, 'A'), b = s(1, 10.0004, 10.0004, 'A')
        const c = clusterByZoom([a, b], 12)
        expect(c).toHaveLength(1)
        expect(c[0].places).toBe(1)
        expect(c[0].latitude).toBeCloseTo(10.0002, 4)
    })
    it('handles no stickers and the poles', () => {
        expect(clusterByZoom([], 5)).toEqual([])
        expect(clusterByZoom([s(1, 90, 0)], 5)).toHaveLength(1)
    })
})

describe('matchesSticker & posterNames', () => {
    const x = {...s(1, 1, 1, 'Lissabon, Portugal'), caption: 'Laternenmast', created_by_name: 'Pudel'}
    it('matches place, caption, author and extra author names, every word, case-insensitive', () => {
        expect(matchesSticker(x, 'lissabon')).toBe(true)
        expect(matchesSticker(x, 'LATERNE pudel')).toBe(true)
        expect(matchesSticker(x, 'marius', ['Marius Gassen'])).toBe(true)
        expect(matchesSticker(x, 'lissabon rom')).toBe(false)
        expect(matchesSticker(x, '')).toBe(true)
    })

    it('collects distinct poster names in order', () => {
        const list = [
            {...s(1, 1, 1), created_by_name: 'Pudel'},
            {...s(2, 1, 1), created_by_name: 'Hasi'},
            {...s(3, 1, 1), created_by_name: 'Pudel'},
            {...s(4, 1, 1), created_by_name: null},
        ]
        expect(posterNames(list)).toEqual(['Pudel', 'Hasi'])
    })

    it('uses CARTO basemap tiles instead of OpenStreetMap tile server', () => {
        expect(TILES).toContain('basemaps.cartocdn.com')
    })
})
