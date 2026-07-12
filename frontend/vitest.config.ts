import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'json-summary'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/test/**',
                'src/**/*.d.ts',
                'src/sw.ts',
                'src/main.tsx',
                'src/types.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            // vite-plugin-pwa's VitePWA plugin (only registered in vite.config.ts, not here)
            // normally exposes this virtual module — alias it to a stub so tests can resolve it.
            'virtual:pwa-register': resolve(__dirname, './src/test/virtualPwaRegisterStub.ts'),
        },
    },
})
