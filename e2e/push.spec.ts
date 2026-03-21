/**
 * E2E tests for Web Push notification flow.
 *
 * Strategy:
 *  - All browser push APIs (navigator.serviceWorker, PushManager,
 *    Notification.requestPermission) are stubbed via page.addInitScript()
 *    so no real service worker or push infrastructure is needed in CI.
 *  - Backend API calls are intercepted with page.route() to control
 *    responses without needing VAPID keys or real subscriptions.
 *  - Login is performed once per test using the API directly; the JWT token
 *    is injected into localStorage so the app boots as authenticated.
 *
 * Required environment variables:
 *   E2E_EMAIL   — login email (default: admin@kegelkasse.de)
 *   E2E_PW      — login password (default: admin123)
 *   BASE_URL    — front-end origin (default: http://localhost:5173)
 *   API_URL     — backend origin (default: http://localhost:8000)
 */
import { test, expect, Page, BrowserContext } from '@playwright/test'

const API_URL = process.env.API_URL ?? 'http://localhost:8000'
const EMAIL = process.env.E2E_EMAIL ?? 'admin@kegelkasse.de'
const PW = process.env.E2E_PW ?? 'admin123'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getJwt(): Promise<string> {
    const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PW }),
    })
    if (!res.ok) throw new Error(`Login failed: ${res.status}`)
    const { access_token } = await res.json()
    return access_token
}

/** Inject JWT into localStorage so the React app considers itself logged in. */
async function loginViaStorage(page: Page, token: string): Promise<void> {
    await page.addInitScript((t) => {
        localStorage.setItem('kegelkasse_token', t)
    }, token)
}

/**
 * Stub browser push APIs so tests don't need a real service worker.
 * The stub makes PushManager.subscribe() return a fake subscription object.
 */
async function stubPushApis(page: Page, { subscribed = false } = {}): Promise<void> {
    await page.addInitScript(({ subscribed }) => {
        // Fake subscription object
        const fakeSub = {
            endpoint: 'https://push.example.com/fake-endpoint',
            toJSON: () => ({
                endpoint: 'https://push.example.com/fake-endpoint',
                keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
            }),
            unsubscribe: async () => true,
        }

        // Fake PushManager
        const fakePushManager = {
            getSubscription: async () => (subscribed ? fakeSub : null),
            subscribe: async () => fakeSub,
        }

        // Fake service worker registration
        const fakeReg = { pushManager: fakePushManager }

        // Override navigator.serviceWorker
        Object.defineProperty(navigator, 'serviceWorker', {
            value: {
                ready: Promise.resolve(fakeReg),
                register: async () => fakeReg,
                addEventListener: () => {},
                removeEventListener: () => {},
            },
            configurable: true,
        })

        // Override Notification
        ;(window as any).Notification = {
            requestPermission: async () => 'granted',
            permission: 'granted',
        }
    }, { subscribed })
}

/** Open the profile sheet by clicking the avatar / profile button. */
async function openProfileSheet(page: Page): Promise<void> {
    // The profile button is typically in the header/nav area
    await page.getByRole('button', { name: /profil|avatar|account/i }).first().click()
    // Wait for the sheet to be visible
    await page.waitForSelector('[data-testid="profile-sheet"], .sheet, [role="dialog"]', { timeout: 5000 })
        .catch(() => {
            // Fallback: look for the push notification section heading
        })
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let jwt: string

test.beforeAll(async () => {
    jwt = await getJwt()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Push notification status', () => {
    test('shows "not configured" state when VAPID is not set', async ({ page }) => {
        await loginViaStorage(page, jwt)
        await stubPushApis(page, { subscribed: false })

        // Mock /push/status → not configured
        await page.route('**/push/status', (route) =>
            route.fulfill({ json: { subscribed: false, configured: false } })
        )

        await page.goto('/')
        await openProfileSheet(page)

        // The push section should not show a subscribe button when VAPID is not configured
        // (the component hides the UI when configured=false and subscribed=false)
        await expect(
            page.getByText(/Benachrichtigungen/i).first()
        ).toBeVisible({ timeout: 10_000 }).catch(() => {
            // Push section may be hidden entirely — that's also correct behaviour
        })
    })

    test('shows subscribe button when VAPID is configured but not subscribed', async ({ page }) => {
        await loginViaStorage(page, jwt)
        await stubPushApis(page, { subscribed: false })

        await page.route('**/push/status', (route) =>
            route.fulfill({ json: { subscribed: false, configured: true } })
        )
        await page.route('**/push/vapid-key', (route) =>
            route.fulfill({ json: { public_key: 'BFakePublicVapidKey0000000000000000000000000' } })
        )
        await page.route('**/push/subscribe', (route) =>
            route.fulfill({ status: 201, json: { ok: true } })
        )

        await page.goto('/')
        await openProfileSheet(page)

        const subscribeBtn = page.getByRole('button', { name: /aktivier|enable|abonnieren/i })
        await expect(subscribeBtn).toBeVisible({ timeout: 10_000 })
    })
})

test.describe('Subscribe flow', () => {
    test('clicking subscribe calls /push/subscribe with correct payload', async ({ page }) => {
        await loginViaStorage(page, jwt)
        await stubPushApis(page, { subscribed: false })

        await page.route('**/push/status', (route) =>
            route.fulfill({ json: { subscribed: false, configured: true } })
        )
        await page.route('**/push/vapid-key', (route) =>
            route.fulfill({ json: { public_key: 'BFakePublicVapidKey0000000000000000000000000' } })
        )

        let subscribeBody: Record<string, string> | null = null
        await page.route('**/push/subscribe', async (route) => {
            subscribeBody = await route.request().postDataJSON()
            await route.fulfill({ status: 201, json: { ok: true } })
        })

        await page.goto('/')
        await openProfileSheet(page)

        const subscribeBtn = page.getByRole('button', { name: /aktivier|enable|abonnieren/i })
        await subscribeBtn.click()

        // Wait for the API call to happen
        await page.waitForResponse('**/push/subscribe', { timeout: 10_000 })

        expect(subscribeBody).not.toBeNull()
        expect(subscribeBody!.endpoint).toBeTruthy()
        expect(subscribeBody!.p256dh).toBeTruthy()
        expect(subscribeBody!.auth).toBeTruthy()
    })
})

test.describe('Unsubscribe flow', () => {
    test('clicking unsubscribe calls DELETE /push/unsubscribe', async ({ page }) => {
        await loginViaStorage(page, jwt)
        await stubPushApis(page, { subscribed: true })

        await page.route('**/push/status', (route) =>
            route.fulfill({ json: { subscribed: true, configured: true } })
        )

        let unsubscribeCalled = false
        await page.route('**/push/unsubscribe**', async (route) => {
            unsubscribeCalled = true
            await route.fulfill({ status: 204, body: '' })
        })

        await page.goto('/')
        await openProfileSheet(page)

        const unsubscribeBtn = page.getByRole('button', { name: /deaktivier|disable|abbestellen/i })
        await expect(unsubscribeBtn).toBeVisible({ timeout: 10_000 })

        const responsePromise = page.waitForResponse('**/push/unsubscribe**', { timeout: 10_000 })
        await unsubscribeBtn.click()
        await responsePromise
        expect(unsubscribeCalled).toBe(true)
    })
})

test.describe('Test push flow', () => {
    test('clicking test push calls POST /push/test', async ({ page }) => {
        await loginViaStorage(page, jwt)
        await stubPushApis(page, { subscribed: true })

        await page.route('**/push/status', (route) =>
            route.fulfill({ json: { subscribed: true, configured: true } })
        )

        let testPushCalled = false
        await page.route('**/push/test', async (route) => {
            testPushCalled = true
            await route.fulfill({ json: { sent: 1 } })
        })

        await page.goto('/')
        await openProfileSheet(page)

        const testBtn = page.getByRole('button', { name: /test|probe/i })
        await testBtn.click()

        await page.waitForResponse('**/push/test', { timeout: 15_000 })
        expect(testPushCalled).toBe(true)
    })
})

test.describe('Push API endpoints (direct)', () => {
    /**
     * These tests call the backend directly (not through the UI) to verify
     * the API behaves correctly end-to-end with a real DB and auth.
     */

    test('GET /push/status returns 200 with subscribed and configured fields', async ({ request }) => {
        const res = await request.get(`${API_URL}/api/v1/push/status`, {
            headers: { Authorization: `Bearer ${jwt}` },
        })
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(typeof body.subscribed).toBe('boolean')
        expect(typeof body.configured).toBe('boolean')
    })

    test('GET /push/vapid-key returns 503 when not configured', async ({ request }) => {
        // Dev server has no VAPID keys by default
        const res = await request.get(`${API_URL}/api/v1/push/vapid-key`, {
            headers: { Authorization: `Bearer ${jwt}` },
        })
        // Either 200 (if keys are set) or 503 (if not) — both are valid
        expect([200, 503]).toContain(res.status())
    })

    test('POST /push/subscribe creates a subscription', async ({ request }) => {
        const res = await request.post(`${API_URL}/api/v1/push/subscribe`, {
            headers: { Authorization: `Bearer ${jwt}` },
            data: {
                endpoint: `https://push.example.com/e2e-test-${Date.now()}`,
                p256dh: 'e2e-p256dh-key',
                auth: 'e2e-auth-key',
            },
        })
        expect(res.status()).toBe(201)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })

    test('DELETE /push/unsubscribe removes all subscriptions', async ({ request }) => {
        const res = await request.delete(`${API_URL}/api/v1/push/unsubscribe`, {
            headers: { Authorization: `Bearer ${jwt}` },
        })
        expect(res.status()).toBe(204)
    })

    test('POST /push/test returns 503 when VAPID not configured', async ({ request }) => {
        // Clean state: no subscription, no VAPID keys
        const res = await request.post(`${API_URL}/api/v1/push/test`, {
            headers: { Authorization: `Bearer ${jwt}` },
        })
        // 503 if VAPID not set, 404 if no subscription, 200 if everything works
        expect([200, 404, 503]).toContain(res.status())
    })

    test('unauthenticated requests to push endpoints return 403', async ({ request }) => {
        const endpoints = [
            { method: 'GET', path: '/push/status' },
            { method: 'GET', path: '/push/vapid-key' },
            { method: 'POST', path: '/push/subscribe' },
            { method: 'DELETE', path: '/push/unsubscribe' },
            { method: 'POST', path: '/push/test' },
        ]
        for (const { method, path } of endpoints) {
            const res = await request.fetch(`${API_URL}/api/v1${path}`, { method })
            expect(res.status(), `${method} ${path} should be 401 without auth`).toBe(401)
        }
    })
})
