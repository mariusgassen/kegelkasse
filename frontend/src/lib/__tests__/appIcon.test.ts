import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {applyAppIcon, DEFAULT_LINKS, resolveIconLinks, restoreAppIcon} from '../appIcon'
import type {AppIconLinks} from '@/types'

const ON: AppIconLinks = {
    enabled: true,
    variant: 'dark',
    manifest_url: '/api/v1/app-icon/tok/manifest.webmanifest?v=1',
    apple_touch_icon_url: '/api/v1/app-icon/tok/apple-touch-icon.png?v=1',
    icon_url: '/api/v1/app-icon/tok/icon-192.png?v=1',
}

const href = (sel: string) => document.head.querySelector(sel)?.getAttribute('href') ?? null

describe('appIcon', () => {
    beforeEach(() => {
        localStorage.clear()
        document.head.innerHTML = `
            <link rel="manifest" href="/manifest.webmanifest">
            <link rel="icon" href="/icon.svg" type="image/svg+xml">
            <link rel="icon" href="/icons/icon-192.png" type="image/png" sizes="192x192">
            <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`
    })
    afterEach(() => {
        document.head.innerHTML = ''
    })

    it('resolves stock links unless the club switched the icon on', () => {
        expect(resolveIconLinks(null)).toEqual(DEFAULT_LINKS)
        expect(resolveIconLinks({...ON, enabled: false})).toEqual(DEFAULT_LINKS)
        expect(resolveIconLinks({...ON, manifest_url: null})).toEqual(DEFAULT_LINKS)
        expect(resolveIconLinks(ON).manifest).toBe(ON.manifest_url)
    })

    it('points manifest, apple-touch-icon and PNG favicon at the club icon', () => {
        applyAppIcon(ON)
        expect(href('link[rel="manifest"]')).toBe(ON.manifest_url)
        expect(href('link[rel="apple-touch-icon"]')).toBe(ON.apple_touch_icon_url)
        expect(href('link[rel="icon"][type="image/png"]')).toBe(ON.icon_url)
        // The SVG favicon is left alone
        expect(href('link[rel="icon"][type="image/svg+xml"]')).toBe('/icon.svg')
    })

    it('switching off restores the stock links and forgets the club icon', () => {
        applyAppIcon(ON)
        applyAppIcon({...ON, enabled: false})
        expect(href('link[rel="manifest"]')).toBe(DEFAULT_LINKS.manifest)
        expect(href('link[rel="apple-touch-icon"]')).toBe(DEFAULT_LINKS.appleTouchIcon)
        expect(localStorage.getItem('kegelkasse-app-icon')).toBeNull()
    })

    it('restores the last club icon on a cold start', () => {
        applyAppIcon(ON)
        document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest">'
        restoreAppIcon()
        expect(href('link[rel="manifest"]')).toBe(ON.manifest_url)
        expect(href('link[rel="apple-touch-icon"]')).toBe(ON.apple_touch_icon_url)
    })

    it('ignores a corrupt stored entry', () => {
        localStorage.setItem('kegelkasse-app-icon', '{nope')
        restoreAppIcon()
        expect(href('link[rel="manifest"]')).toBe(DEFAULT_LINKS.manifest)
    })

    it('does not invent a stock manifest link where the build has none (dev)', () => {
        document.head.innerHTML = ''
        applyAppIcon(null)
        expect(document.head.querySelector('link[rel="manifest"]')).toBeNull()
        applyAppIcon(ON)
        expect(href('link[rel="manifest"]')).toBe(ON.manifest_url)
    })
})
