// Node.js 18 does not expose crypto as a global — polyfill for workbox-build/terser
import {webcrypto} from 'node:crypto'
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', {value: webcrypto})

import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {VitePWA} from 'vite-plugin-pwa'
import {fileURLToPath, URL} from 'node:url'

export default defineConfig({
    resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},
    server: {
        proxy: {
            '/api': {target: 'http://127.0.0.1:8000', changeOrigin: true}
        }
    },
    plugins: [
        react(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg', 'logo192.png', 'logo512.png'],
            manifest: {
                name: 'Kegelkasse',
                short_name: 'Kegelkasse',
                description: '9-Pin Bowling Club Manager',
                theme_color: '#3d3540',
                background_color: '#1a1410',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                icons: [
                    {src: 'icon.svg', sizes: 'any', type: 'image/svg+xml'},
                    {src: 'logo192.png', sizes: '500x500', type: 'image/png'},
                    {src: 'logo512.png', sizes: '500x500', type: 'image/png', purpose: 'maskable'},
                ],
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            },
        }),
    ],
})
