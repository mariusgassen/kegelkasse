import {describe, expect, it} from 'vitest'
import {groupByPlace, groupPhotos, placeCount} from '../stickers'
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
