/**
 * Tests for tokenStore — persistTokenForSW using fake-indexeddb.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

describe('persistTokenForSW', () => {
    beforeEach(async () => {
        // Fresh IDB state: delete the DB between tests
        indexedDB.deleteDatabase('kegelkasse_auth')
    })

    it('stores a token without throwing', async () => {
        const { persistTokenForSW } = await import('../lib/tokenStore')
        await expect(persistTokenForSW('my-jwt-token')).resolves.toBeUndefined()
    })

    it('stores null (delete) without throwing', async () => {
        const { persistTokenForSW } = await import('../lib/tokenStore')
        await persistTokenForSW('my-jwt-token')
        await expect(persistTokenForSW(null)).resolves.toBeUndefined()
    })

    it('can be called multiple times with the same token', async () => {
        const { persistTokenForSW } = await import('../lib/tokenStore')
        await persistTokenForSW('token-a')
        await persistTokenForSW('token-b')
        // No throw = success
        await expect(persistTokenForSW('token-c')).resolves.toBeUndefined()
    })
})
