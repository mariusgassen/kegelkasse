/**
 * Tests for CameraCapturePage.
 *
 * Camera hardware (getUserMedia, video frames, RAF loop) is mocked so tests
 * focus on the UI state machine: mode toggle, calibration, game selection,
 * test-throw submission, game finish, and kiosk mode entry/exit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: vi.fn(() => ({ evening: null, invalidate: vi.fn() })),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel?: any) => {
        const store = { user: null }
        return sel ? sel(store) : store
    }),
    isAdmin: vi.fn(() => false),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        addCameraThrow: vi.fn(),
        finishGame: vi.fn(),
        setActivePlayer: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))

vi.mock('@/lib/cameraEngine.ts', () => ({
    readFrame: vi.fn(() => ({
        throwNum: null, throwPins: null, cumulative: null,
        pinStates: Array(9).fill(false), lampRed: false, lampGreen: false,
    })),
    DEFAULT_CALIBRATION: {
        displayLeft:   { x: 0.05, y: 0.55, w: 0.18, h: 0.25, digits: 1 },
        displayMiddle: { x: 0.35, y: 0.55, w: 0.28, h: 0.25, digits: 1 },
        displayRight:  { x: 0.67, y: 0.55, w: 0.30, h: 0.25, digits: 2 },
        pinArea:       { x: 0.10, y: 0.05, w: 0.80, h: 0.45 },
        lampRed:       { x: 0.02, y: 0.55, w: 0.04, h: 0.08 },
        lampGreen:     { x: 0.02, y: 0.45, w: 0.04, h: 0.08 },
        brightness: 60, redness: 80, version: 2,
    },
    PIN_POSITIONS: [
        [0.50, 0.10], [0.30, 0.30], [0.70, 0.30],
        [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],
        [0.30, 0.70], [0.70, 0.70], [0.50, 0.90],
    ],
}))

vi.mock('@/lib/turnOrder.ts', () => ({
    buildTurnOrder: vi.fn(() => []),
}))

// ── browser API stubs ─────────────────────────────────────────────────────────

// getUserMedia — default resolves with empty stream; individual tests can override
const mockGetUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
} as any)

// ResizeObserver stub (not available in jsdom)
class MockResizeObserver {
    observe() {}
    disconnect() {}
}

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        value: { getUserMedia: mockGetUserMedia },
        configurable: true,
        writable: true,
    })
    // Stub localStorage
    vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
    })
    mockGetUserMedia.mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

// ── fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_USER = {
    id: 1, role: 'admin', email: 'admin@test.de', name: 'Admin',
    username: 'admin', club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: 1,
}

const PLAYERS = [
    { id: 10, name: 'Admin', regular_member_id: 1, team_id: null, is_king: false },
    { id: 11, name: 'Hansi', regular_member_id: 2, team_id: null, is_king: false },
]

const RUNNING_GAME = {
    id: 1, name: 'Hauptspiel', status: 'running', is_opener: false,
    sort_order: 1, winner_ref: null, winner_name: null, scores: {},
    loser_penalty: 2.00, per_point_penalty: 0, winner_type: 'individual',
    turn_mode: 'alternating', started_at: '2026-01-10T20:30:00', finished_at: null,
    note: null, template_id: null, client_timestamp: 1000, active_player_id: null, throws: [],
}

const ACTIVE_EVENING = {
    id: 42,
    date: '2026-01-10T20:00:00',
    venue: 'Stammtisch',
    note: null,
    is_closed: false,
    players: PLAYERS,
    teams: [],
    games: [RUNNING_GAME],
    penalty_log: [],
    drink_rounds: [],
    highlights: [],
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
}

async function renderCameraCapturePage(onClose = vi.fn()) {
    const { CameraCapturePage } = await import('../CameraCapturePage')
    return render(<CameraCapturePage onClose={onClose} />, { wrapper: makeWrapper() })
}

async function setupAdmin() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(true)
    vi.mocked(useAppStore).mockImplementation((sel?: any) => {
        const store = { user: ADMIN_USER }
        return sel ? sel(store) : store
    })
}

async function setupMemberUser() {
    const { isAdmin, useAppStore } = await import('@/store/app.ts')
    vi.mocked(isAdmin).mockReturnValue(false)
    vi.mocked(useAppStore).mockImplementation((sel?: any) => {
        const store = { user: null }
        return sel ? sel(store) : store
    })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('CameraCapturePage — basic rendering', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: null, invalidate: vi.fn() } as any)
        await setupMemberUser()
    })

    it('shows camera title in header', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText(/camera\.title/)).toBeInTheDocument()
    })

    it('shows close button', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText('✕')).toBeInTheDocument()
    })

    it('calls onClose when close button clicked', async () => {
        const onClose = vi.fn()
        await renderCameraCapturePage(onClose)
        fireEvent.click(screen.getByText('✕'))
        expect(onClose).toHaveBeenCalled()
    })

    it('shows calibrate button in detecting mode', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText(/camera\.calibrate/)).toBeInTheDocument()
    })
})

describe('CameraCapturePage — camera error', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: null, invalidate: vi.fn() } as any)
        await setupMemberUser()
    })

    it('shows camera error message when getUserMedia fails', async () => {
        mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
        await renderCameraCapturePage()
        await waitFor(() => {
            expect(screen.getByText(/camera\.noCamera/)).toBeInTheDocument()
        })
    })

    it('shows the error detail text', async () => {
        mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
        await renderCameraCapturePage()
        await waitFor(() => {
            expect(screen.getByText(/Permission denied/)).toBeInTheDocument()
        })
    })
})

describe('CameraCapturePage — mode toggle', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: null, invalidate: vi.fn() } as any)
        await setupMemberUser()
    })

    it('switches to calibration mode when calibrate button clicked', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => {
            // Calibration mode shows "camera.detecting" button and calibration hint
            expect(screen.getByText(/camera\.detecting/)).toBeInTheDocument()
        })
    })

    it('shows calibration hint in calibration mode', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => {
            expect(screen.getByText('camera.calibrateHint')).toBeInTheDocument()
        })
    })

    it('switches back to detecting mode when detecting button clicked', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => screen.getByText(/camera\.detecting/))
        fireEvent.click(screen.getByText(/camera\.detecting/))
        await waitFor(() => {
            expect(screen.getByText(/camera\.calibrate/)).toBeInTheDocument()
        })
    })
})

describe('CameraCapturePage — calibration controls', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({ evening: null, invalidate: vi.fn() } as any)
        await setupMemberUser()
    })

    it('shows brightness slider in calibration mode', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => {
            expect(screen.getByText(/camera\.brightness/)).toBeInTheDocument()
        })
    })

    it('shows redness slider in calibration mode', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => {
            expect(screen.getByText(/camera\.redness/)).toBeInTheDocument()
        })
    })

    it('saves calibration to localStorage when save button clicked', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => screen.getByText(/camera\.saveCalibration/))
        fireEvent.click(screen.getByText(/camera\.saveCalibration/))
        expect(localStorage.setItem).toHaveBeenCalledWith(
            'kce_camera_cal_v2',
            expect.any(String),
        )
    })

    it('switches back to detecting after saving calibration', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => screen.getByText(/camera\.saveCalibration/))
        fireEvent.click(screen.getByText(/camera\.saveCalibration/))
        await waitFor(() => {
            expect(screen.getByText(/camera\.calibrate/)).toBeInTheDocument()
        })
    })

    it('updates brightness value when slider changes', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText(/camera\.calibrate/))
        await waitFor(() => screen.getByText(/camera\.brightness/))
        // Brightness slider: get by type=range
        const sliders = document.querySelectorAll('input[type="range"]')
        fireEvent.change(sliders[0], { target: { value: '120' } })
        await waitFor(() => {
            // The label shows "camera.brightness: 120"
            expect(screen.getByText('120')).toBeInTheDocument()
        })
    })
})

describe('CameraCapturePage — detection mode with game', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
    })

    it('shows camera.selectGame label for admin', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText('camera.selectGame')).toBeInTheDocument()
    })

    it('shows running game chip', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText('Hauptspiel')).toBeInTheDocument()
    })

    it('shows throw history section', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText('camera.throwHistory')).toBeInTheDocument()
    })

    it('shows no throws message initially', async () => {
        await renderCameraCapturePage()
        expect(screen.getByText('camera.noThrows')).toBeInTheDocument()
    })

    it('shows test mode button after selecting a running game', async () => {
        await renderCameraCapturePage()
        // Select the game chip
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => {
            expect(screen.getByText(/camera\.testMode/)).toBeInTheDocument()
        })
    })

    it('shows camera.noRunningGame when no running games', async () => {
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        const eveningNoGames = { ...ACTIVE_EVENING, games: [] }
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: eveningNoGames as any,
            invalidate: vi.fn(),
        } as any)
        await renderCameraCapturePage()
        expect(screen.getByText('camera.noRunningGame')).toBeInTheDocument()
    })
})

describe('CameraCapturePage — test throw mode', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
        vi.mocked(api.addCameraThrow).mockResolvedValue({} as any)
    })

    it('toggles test mode panel when test mode button clicked', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText(/camera\.testMode/))
        fireEvent.click(screen.getByText(/camera\.testMode/))
        await waitFor(() => {
            expect(screen.getByText('camera.testModeHint')).toBeInTheDocument()
        })
    })

    it('calls api.addCameraThrow when test throw submitted', async () => {
        const { api } = await import('@/api/client.ts')
        await renderCameraCapturePage()
        // Select game
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText(/camera\.testMode/))
        // Open test mode panel
        fireEvent.click(screen.getByText(/camera\.testMode/))
        await waitFor(() => screen.getByText('camera.testModeHint'))
        // Click the submit test throw button (text: "▶ camera.testSend")
        const addThrowBtn = screen.getByText(/camera\.testSend/)
        fireEvent.click(addThrowBtn)
        await waitFor(() => {
            expect(api.addCameraThrow).toHaveBeenCalledWith(42, 1, expect.objectContaining({
                throw_num: 1,
                pins: 9, // default testPins
            }))
        })
    })
})

describe('CameraCapturePage — game finish', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
        vi.mocked(api.finishGame).mockResolvedValue(undefined as any)
    })

    it('shows winner section after game is selected', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => {
            expect(screen.getByText('game.winner')).toBeInTheDocument()
        })
    })

    it('shows player names as winner options', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => {
            expect(screen.getAllByText('Admin').length).toBeGreaterThan(0)
            expect(screen.getAllByText('Hansi').length).toBeGreaterThan(0)
        })
    })

    it('calls api.finishGame when winner selected and finish clicked', async () => {
        const { api } = await import('@/api/client.ts')
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText('game.winner'))
        // Select winner Admin (player id=10 → ref=p:10)
        const adminBtns = screen.getAllByText('Admin')
        fireEvent.click(adminBtns[adminBtns.length - 1])
        fireEvent.click(screen.getByText(/game\.finish/))
        await waitFor(() => {
            expect(api.finishGame).toHaveBeenCalledWith(42, 1, expect.objectContaining({
                winner_ref: 'p:10',
                winner_name: 'Admin',
            }))
        })
    })

    it('finish button is disabled when no winner selected', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText(/game\.finish/))
        const finishBtn = screen.getByText(/game\.finish/)
        expect(finishBtn).toBeDisabled()
    })
})

describe('CameraCapturePage — kiosk mode', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        const { useActiveEvening } = await import('@/hooks/useEvening.ts')
        vi.mocked(useActiveEvening).mockReturnValue({
            evening: ACTIVE_EVENING as any,
            invalidate: vi.fn(),
        } as any)
        await setupAdmin()
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setActivePlayer).mockResolvedValue(undefined as any)
    })

    it('enters kiosk mode via enter kiosk button', async () => {
        await renderCameraCapturePage()
        // Select a game first
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText(/camera\.syncActive/))
        fireEvent.click(screen.getByText(/camera\.enterKiosk/))
        await waitFor(() => {
            // In kiosk mode: header is hidden, kiosk label appears
            expect(screen.getByText(/camera\.kiosk/)).toBeInTheDocument()
        })
    })

    it('hides standard header in kiosk mode', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText(/camera\.syncActive/))
        fireEvent.click(screen.getByText(/camera\.enterKiosk/))
        await waitFor(() => {
            // camera.title text only appears in the non-kiosk header
            expect(screen.queryByText(/📷 camera\.title/)).not.toBeInTheDocument()
        })
    })

    it('exits kiosk mode via exit kiosk button', async () => {
        await renderCameraCapturePage()
        fireEvent.click(screen.getByText('Hauptspiel'))
        await waitFor(() => screen.getByText(/camera\.syncActive/))
        fireEvent.click(screen.getByText(/camera\.enterKiosk/))
        await waitFor(() => screen.getByText(/camera\.exitKiosk/))
        fireEvent.click(screen.getByText(/camera\.exitKiosk/))
        await waitFor(() => {
            expect(screen.getByText(/camera\.calibrate/)).toBeInTheDocument()
        })
    })
})
