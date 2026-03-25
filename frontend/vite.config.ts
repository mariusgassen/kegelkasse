// Node.js 18 does not expose crypto as a global — polyfill for workbox-build/terser
import {webcrypto} from 'node:crypto'
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', {value: webcrypto})

import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {VitePWA} from 'vite-plugin-pwa'
import {fileURLToPath, URL} from 'node:url'
import {execSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {version: string}

// Use git commit hash for cache busting; fall back to build timestamp in CI/Docker
const buildHash: string = (() => {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim()
    } catch {
        return Date.now().toString(36)
    }
})()

export default defineConfig({
    define: {
        __BUILD_HASH__: JSON.stringify(buildHash),
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}},
    server: {
        proxy: {
            '/api': {target: 'http://127.0.0.1:8000', changeOrigin: true}
        }
    },
    plugins: [
        tailwindcss(),
        react(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
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
                    {src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable'},
                ],
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            },
        }),
    ],
})
