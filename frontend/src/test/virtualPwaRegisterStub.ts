// Test-only stand-in for the `virtual:pwa-register` module vite-plugin-pwa injects at build
// time. vitest.config.ts aliases the real specifier to this file so the module graph can
// resolve it; individual tests then `vi.mock('virtual:pwa-register', ...)` to control behavior.
export function registerSW(): (reload?: boolean) => Promise<void> {
    return async () => {}
}
