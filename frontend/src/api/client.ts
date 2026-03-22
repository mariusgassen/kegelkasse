import {t as tl} from '@/i18n'
import {offlineQueue, isQueuableMutation} from '@/offlineQueue'
import {persistTokenForSW} from '@/lib/tokenStore'
import {
    Club,
    ClubAnnouncement,
    ClubSettings,
    ClubTeam,
    ClubPin,
    ClubTrip,
    DrinkRound,
    Evening,
    EveningHighlight,
    EveningListItem,
    EveningPlayer,
    GameTemplate,
    PenaltyLogEntry,
    PenaltyType,
    PushPreferences,
    RegularMember,
    ReminderSettings,
    RsvpEntry,
    RsvpStatus,
    ScheduledEvening,
    ScheduledEveningGuest,
    Team,
    User,
    PaymentRequest,
    PgBackrestStanza
} from '@/types';

const API_BASE = '/api/v1'
let _token: string | null = localStorage.getItem('kegelkasse_token')

export class UnauthorizedError extends Error {
    constructor() {
        super(tl('error.session'))
        this.name = 'UnauthorizedError'
    }
}

export class NetworkError extends Error {
    constructor() {
        super(tl('error.network'))
        this.name = 'NetworkError'
    }
}

export class OfflineQueuedError extends Error {
    constructor() {
        super(tl('sync.queued'))
        this.name = 'OfflineQueuedError'
    }
}

/** Set to true during flushOfflineQueue to prevent re-queueing replayed requests. */
let _bypassQueue = false

type UnauthorizedCallback = () => void
let _unauthorizedCallbacks: UnauthorizedCallback[] = []

export const authState = {
    setToken(t: string | null) {
        _token = t
        if (t) localStorage.setItem('kegelkasse_token', t)
        else localStorage.removeItem('kegelkasse_token')
        persistTokenForSW(t)
    },
    getToken: () => _token,
    isLoggedIn: () => !!_token,
    onUnauthorized(cb: UnauthorizedCallback): () => void {
        _unauthorizedCallbacks.push(cb)
        return () => { _unauthorizedCallbacks = _unauthorizedCallbacks.filter(f => f !== cb) }
    },
    _fireUnauthorized() {
        _unauthorizedCallbacks.forEach(cb => cb())
    },
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {'Content-Type': 'application/json'}
    if (_token) headers['Authorization'] = `Bearer ${_token}`
    let res: Response
    try {
        res = await fetch(API_BASE + path, {
            method, headers, body: body ? JSON.stringify(body) : undefined,
        })
    } catch {
        if (!_bypassQueue && isQueuableMutation(method, path)) {
            await offlineQueue.enqueue(method, path, body)
            window.dispatchEvent(new CustomEvent('kegelkasse:queue-changed'))
            // Return null so callers treat this as success (sheet closes, etc.)
            return null as T
        }
        throw new NetworkError()
    }
    if (res.status === 401) {
        authState._fireUnauthorized()
        throw new UnauthorizedError()
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
    }
    return res.status === 204 ? (null as T) : res.json()
}

export const api = {
    // Auth
    login: (email: string, pw: string) =>
        request<{ access_token: string; user: User }>('POST', '/auth/login', {email, password: pw}),
    me: () => request<User>('GET', '/auth/me'),
    updateLocale: (locale: string) => request<void>('PATCH', '/auth/locale', {locale}),
    updateProfile: (d: {
        name?: string;
        username?: string;
        email?: string;
        current_password?: string;
        new_password?: string
    }) =>
        request<User>('PATCH', '/auth/profile', d),
    updateAvatar: (avatar: string | null) => request<User>('PATCH', '/auth/avatar', {avatar}),
    deleteAccount: () => request<void>('DELETE', '/auth/me'),
    createInvite: () => request<{ token: string; expires_at: string; invite_url: string }>('POST', '/auth/invite'),
    createResetToken: (userId: number) =>
        request<{ token: string; reset_url: string }>('POST', '/auth/create-reset-token', {user_id: userId}),
    resetPassword: (token: string, newPassword: string) =>
        request<void>('POST', '/auth/reset-password', {token, new_password: newPassword}),
    getInviteInfo: (token: string) =>
        request<{ valid: boolean; member_name: string | null }>('GET', `/auth/invite-info?token=${token}`),
    register: (token: string, pw: string, username: string, name?: string) =>
        request<{ access_token: string; user: User }>('POST', '/auth/register', {
            token, password: pw, username, ...(name ? {name} : {})
        }),

    // Club
    getClub: () => request<Club>('GET', '/club/'),
    updateClubSettings: (d: Partial<ClubSettings> & {
        name?: string;
        guest_penalty_cap?: number | null;
        paypal_me?: string | null;
        no_cancel_fee?: number | null;
        pin_penalty?: number | null;
        default_evening_time?: string | null;
    }) => request<void>('PATCH', '/club/settings', d),
    getMembers: (includeInactive = false) =>
        request<{
            id: number;
            name: string;
            role: string;
            regular_member_id: number | null;
            is_active: boolean;
            avatar: string | null
        }[]>(
            'GET', `/club/members${includeInactive ? '?include_inactive=true' : ''}`),
    updateMemberRole: (id: number, role: string) => request<void>('PATCH', `/club/members/${id}/role?role=${role}`),
    deactivateMember: (id: number) => request<void>('DELETE', `/club/members/${id}`),
    reactivateMember: (id: number) => request<void>('PATCH', `/club/members/${id}/reactivate`),
    linkUserToRoster: (userId: number, regularMemberId: number | null) =>
        request<void>('PATCH', `/club/members/${userId}/link`, {regular_member_id: regularMemberId}),

    // Superadmin
    listAllClubs: () => request<{
        id: number;
        name: string;
        slug: string;
        member_count: number;
        is_active: boolean
    }[]>('GET', '/superadmin/clubs'),
    createClub: (name: string) => request<{
        id: number;
        name: string;
        slug: string;
        member_count: number;
        is_active: boolean
    }>('POST', '/superadmin/clubs', {name}),
    switchClub: (clubId: number) => request<{
        access_token: string;
        user: User
    }>('POST', `/superadmin/switch-club/${clubId}`),

    // Regular members (Stammspieler)
    mergeRegularMembers: (discardId: number, keepId: number) =>
        request<void>('POST', `/club/regular-members/${discardId}/merge-into/${keepId}`),
    createMemberInvite: (mid: number) =>
        request<{
            token: string;
            invite_url: string;
            member_name: string
        }>('POST', `/club/regular-members/${mid}/invite`),
    listRegularMembers: () => request<RegularMember[]>('GET', '/club/regular-members'),
    createRegularMember: (d: { name: string; nickname?: string; is_guest?: boolean }) =>
        request<RegularMember>('POST', '/club/regular-members', d),
    updateRegularMember: (id: number, d: { name: string; nickname?: string; is_guest?: boolean }) =>
        request<RegularMember>('PUT', `/club/regular-members/${id}`, d),
    deleteRegularMember: (id: number) => request<void>('DELETE', `/club/regular-members/${id}`),

    // Penalty types
    listPenaltyTypes: () => request<PenaltyType[]>('GET', '/club/penalty-types'),
    createPenaltyType: (d: { icon: string; name: string; default_amount: number; sort_order: number }) =>
        request<PenaltyType>('POST', '/club/penalty-types', d),
    updatePenaltyType: (id: number, d: { icon: string; name: string; default_amount: number; sort_order: number }) =>
        request<PenaltyType>('PUT', `/club/penalty-types/${id}`, d),
    deletePenaltyType: (id: number) => request<void>('DELETE', `/club/penalty-types/${id}`),

    // Club teams
    listClubTeams: () => request<ClubTeam[]>('GET', '/club/teams'),
    createClubTeam: (d: { name: string; sort_order: number }) => request<ClubTeam>('POST', '/club/teams', d),
    updateClubTeam: (id: number, d: {
        name: string;
        sort_order: number
    }) => request<ClubTeam>('PUT', `/club/teams/${id}`, d),
    deleteClubTeam: (id: number) => request<void>('DELETE', `/club/teams/${id}`),
    applyClubTeamsToEvening: (eid: number, shuffle = false) =>
        request<Evening>('POST', `/evening/${eid}/teams/from-templates${shuffle ? '?shuffle=true' : ''}`),

    // Game templates
    listGameTemplates: () => request<GameTemplate[]>('GET', '/club/game-templates'),
    createGameTemplate: (d: {
        name: string;
        description?: string;
        winner_type: string;
        is_opener: boolean;
        default_loser_penalty: number;
        per_point_penalty: number;
        sort_order: number
    }) =>
        request<GameTemplate>('POST', '/club/game-templates', d),
    updateGameTemplate: (id: number, d: {
        name: string;
        description?: string;
        winner_type: string;
        is_opener: boolean;
        default_loser_penalty: number;
        per_point_penalty: number;
        sort_order: number
    }) =>
        request<GameTemplate>('PUT', `/club/game-templates/${id}`, d),
    deleteGameTemplate: (id: number) => request<void>('DELETE', `/club/game-templates/${id}`),

    // Evenings
    listEvenings: () => request<EveningListItem[]>('GET', '/evening/'),
    createEvening: (d: { date: string; venue?: string; note?: string }) =>
        request<Evening>('POST', '/evening/', d),
    getEvening: (id: number) => request<Evening>('GET', `/evening/${id}`),
    updateEvening: (id: number, d: { date?: string; venue?: string; note?: string; is_closed?: boolean }) =>
        request<Evening>('PATCH', `/evening/${id}`, d),
    deleteEvening: (id: number) => request<void>('DELETE', `/evening/${id}`),

    // Evening players
    addPlayer: (eid: number, d: { name: string; regular_member_id?: number; team_id?: number }) =>
        request<EveningPlayer>('POST', `/evening/${eid}/players`, d),
    updatePlayer: (eid: number, pid: number, d: { name?: string; team_id?: number | null }) =>
        request<void>('PATCH', `/evening/${eid}/players/${pid}`, d),
    removePlayer: (eid: number, pid: number) => request<void>('DELETE', `/evening/${eid}/players/${pid}`),

    // Teams
    createTeam: (eid: number, d: { name: string; player_ids: number[] }) =>
        request<Team>('POST', `/evening/${eid}/teams`, d),
    updateTeam: (eid: number, tid: number, d: { name?: string; player_ids?: number[] }) =>
        request<void>('PATCH', `/evening/${eid}/teams/${tid}`, d),
    deleteTeam: (eid: number, tid: number) => request<void>('DELETE', `/evening/${eid}/teams/${tid}`),

    // Penalties
    addPenalty: (eid: number, d: {
        player_ids?: number[];
        team_id?: number;
        penalty_type_name: string;
        icon: string;
        amount: number;
        mode: string;
        unit_amount?: number;
        client_timestamp: number
    }) =>
        request<PenaltyLogEntry[]>('POST', `/evening/${eid}/penalties`, d),
    updatePenalty: (eid: number, lid: number, d: {
        player_id?: number;
        penalty_type_name?: string;
        icon?: string;
        amount?: number;
        mode?: string;
        date?: string;
    }) =>
        request<void>('PATCH', `/evening/${eid}/penalties/${lid}`, d),
    deletePenalty: (eid: number, lid: number) => request<void>('DELETE', `/evening/${eid}/penalties/${lid}`),
    calculateAbsencePenalties: (eid: number) =>
        request<{ avg: number; absent_count: number }>('POST', `/evening/${eid}/absence-penalties`),
    markCancelled: (eid: number, member_ids: number[]) =>
        request<{ ok: boolean; count: number }>('POST', `/evening/${eid}/mark-cancelled`, {member_ids}),

    // Games
    addGame: (eid: number, d: {
        name: string;
        template_id?: number;
        is_opener?: boolean;
        winner_type?: string;
        loser_penalty?: number;
        per_point_penalty?: number;
        note?: string;
        sort_order?: number;
        client_timestamp: number
    }) =>
        request<{ id: number; name: string }>('POST', `/evening/${eid}/games`, d),
    startGame: (eid: number, gid: number) =>
        request<void>('POST', `/evening/${eid}/games/${gid}/start`),
    finishGame: (eid: number, gid: number, d: {
        winner_ref: string;
        winner_name: string;
        scores?: Record<string, number>;
        loser_penalty?: number;
    }) =>
        request<void>('POST', `/evening/${eid}/games/${gid}/finish`, d),
    updateGame: (eid: number, gid: number, d: Partial<{
        name: string;
        is_opener: boolean;
        winner_type: string;
        loser_penalty: number;
        per_point_penalty: number;
        note: string
    }>) =>
        request<void>('PATCH', `/evening/${eid}/games/${gid}`, d),
    deleteGame: (eid: number, gid: number) => request<void>('DELETE', `/evening/${eid}/games/${gid}`),
    addCameraThrow: (eid: number, gid: number, d: {
        throw_num: number;
        pins: number;
        cumulative?: number;
        pin_states: boolean[];
        player_id?: number | null
    }) => request<{ok: boolean}>('POST', `/evening/${eid}/games/${gid}/throws`, d),
    clearCameraThrows: (eid: number, gid: number) =>
        request<{ok: boolean}>('DELETE', `/evening/${eid}/games/${gid}/throws`),
    deleteCameraThrow: (eid: number, gid: number, tid: number) =>
        request<{ok: boolean}>('DELETE', `/evening/${eid}/games/${gid}/throws/${tid}`),

    // Drinks
    addDrinkRound: (eid: number, d: {
        drink_type: string;
        variety?: string;
        participant_ids: number[];
        client_timestamp: number
    }) =>
        request<DrinkRound>('POST', `/evening/${eid}/drinks`, d),
    updateDrinkRound: (eid: number, rid: number, d: { variety?: string; participant_ids?: number[] }) =>
        request<void>('PATCH', `/evening/${eid}/drinks/${rid}`, d),
    deleteDrinkRound: (eid: number, rid: number) => request<void>('DELETE', `/evening/${eid}/drinks/${rid}`),

    // Member balances & payments
    getMemberBalances: () => request<{
        regular_member_id: number; name: string; nickname: string | null;
        penalty_total: number; payments_total: number; balance: number
    }[]>('GET', '/club/member-balances'),
    getGuestBalances: () => request<{
        regular_member_id: number; name: string; nickname: string | null;
        penalty_total: number; payments_total: number; balance: number
    }[]>('GET', '/club/guest-balances'),
    getMemberPayments: (mid: number) => request<{
        id: number; amount: number; note: string | null; created_at: string | null
    }[]>('GET', `/club/member-payments/${mid}`),
    getAllPayments: () => request<{
        id: number; regular_member_id: number; member_name: string;
        amount: number; note: string | null; created_at: string | null
    }[]>('GET', '/club/member-payments'),
    createMemberPayment: (d: { regular_member_id: number; amount: number; note?: string }) =>
        request<{
            id: number;
            amount: number;
            note: string | null;
            created_at: string | null
        }>('POST', '/club/member-payments', d),
    deleteMemberPayment: (pid: number) => request<void>('DELETE', `/club/member-payments/${pid}`),

    // Club expenses
    getExpenses: () => request<{
        id: number; amount: number; description: string; created_at: string | null; date: string | null
    }[]>('GET', '/club/expenses'),
    createExpense: (d: { amount: number; description: string; date?: string }) =>
        request<{ id: number; amount: number; description: string; created_at: string | null; date: string | null }>('POST', '/club/expenses', d),
    deleteExpense: (eid: number) => request<void>('DELETE', `/club/expenses/${eid}`),

    // My balance
    getMyBalance: () => request<{
        regular_member_id: number | null;
        penalty_total: number | null;
        payments_total: number | null;
        balance: number | null
    }>('GET', '/club/my-balance'),

    // Payment requests
    getPaymentRequests: () => request<PaymentRequest[]>('GET', '/club/payment-requests'),
    getMyPaymentRequests: () => request<PaymentRequest[]>('GET', '/club/payment-requests/my'),
    createPaymentRequest: (d: { amount: number; note?: string }) =>
        request<PaymentRequest>('POST', '/club/payment-requests', d),
    confirmPaymentRequest: (rid: number) =>
        request<PaymentRequest>('PATCH', `/club/payment-requests/${rid}/confirm`),
    rejectPaymentRequest: (rid: number) =>
        request<PaymentRequest>('PATCH', `/club/payment-requests/${rid}/reject`),

    // Schedule (planned evenings & RSVP)
    listScheduledEvenings: () => request<ScheduledEvening[]>('GET', '/schedule/'),
    createScheduledEvening: (d: { date: string; venue?: string; note?: string }) =>
        request<ScheduledEvening>('POST', '/schedule/', d),
    updateScheduledEvening: (sid: number, d: { date?: string; venue?: string; note?: string }) =>
        request<ScheduledEvening>('PATCH', `/schedule/${sid}`, d),
    deleteScheduledEvening: (sid: number) => request<void>('DELETE', `/schedule/${sid}`),
    setRsvp: (sid: number, status: RsvpStatus) =>
        request<{ status: RsvpStatus }>('POST', `/schedule/${sid}/rsvp`, {status}),
    setRsvpForMember: (sid: number, mid: number, status: RsvpStatus) =>
        request<{ status: RsvpStatus }>('POST', `/schedule/${sid}/rsvp/member/${mid}`, {status}),
    removeRsvp: (sid: number) => request<void>('DELETE', `/schedule/${sid}/rsvp`),
    listRsvps: (sid: number) => request<RsvpEntry[]>('GET', `/schedule/${sid}/rsvps`),
    sendReminder: (sid: number) => request<{ reminded_count: number }>('POST', `/schedule/${sid}/remind`),
    addScheduledGuest: (sid: number, d: { name: string; regular_member_id?: number | null }) =>
        request<ScheduledEveningGuest>('POST', `/schedule/${sid}/guests`, d),
    removeScheduledGuest: (sid: number, gid: number) =>
        request<void>('DELETE', `/schedule/${sid}/guests/${gid}`),
    startEveningFromSchedule: (sid: number, d: { member_ids: number[] }) =>
        request<{ id: number; date: string; venue: string | null }>('POST', `/schedule/${sid}/start`, d),

    // Pins
    listPins: () => request<ClubPin[]>('GET', '/club/pins'),
    createPin: (d: { name: string; icon?: string }) =>
        request<ClubPin>('POST', '/club/pins', d),
    updatePin: (id: number, d: {
        name?: string;
        icon?: string;
        holder_regular_member_id?: number | null;
        assigned_at?: string | null
    }) =>
        request<ClubPin>('PUT', `/club/pins/${id}`, d),
    deletePin: (id: number) => request<void>('DELETE', `/club/pins/${id}`),

    // Highlights
    addHighlight: (eid: number, d: { text: string }) =>
        request<EveningHighlight>('POST', `/evening/${eid}/highlights`, d),
    deleteHighlight: (eid: number, hid: number) =>
        request<void>('DELETE', `/evening/${eid}/highlights/${hid}`),

    // Stats
    getYearStats: (year: number) => request<{
        year: number;
        evening_count: number;
        total_penalties: number;
        total_beers: number;
        total_shots: number;
        players: {
            name: string; regular_member_id: number | null;
            evenings: number; penalty_total: number; penalty_count: number;
            game_wins: number; beer_rounds: number; shot_rounds: number
        }[]
    }>('GET', `/stats/year/${year}`),
    getMyStats: (year: number) => request<{
        year: number; regular_member_id: number | null;
        penalty_total: number; evenings_attended: number;
        total_evenings: number; game_wins: number; beer_rounds: number
    }>('GET', `/stats/me/${year}`),

    // Sync
    sync: (payload: { client_id: string; last_sync?: number; changes: any[] }) =>
        request<{ applied: number; errors: any[]; server_timestamp: number }>('POST', '/sync/', payload),

    // Push notifications
    getVapidPublicKey: () => request<{ public_key: string }>('GET', '/push/vapid-key'),
    getPushStatus: () => request<{ subscribed: boolean; configured: boolean }>('GET', '/push/status'),
    subscribeToPush: (d: { endpoint: string; p256dh: string; auth: string }) =>
        request<{ ok: boolean }>('POST', '/push/subscribe', d),
    unsubscribeFromPush: (endpoint?: string) =>
        request<void>('DELETE', `/push/unsubscribe${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`),
    testPush: () => request<{ sent: number }>('POST', '/push/test'),
    getPushPreferences: () => request<PushPreferences>('GET', '/push/preferences'),
    updatePushPreferences: (d: Partial<PushPreferences>) =>
        request<PushPreferences>('PATCH', '/push/preferences', d),
    getRecentNotifications: () =>
        request<{id: number; title: string; body: string; url: string; created_at: string}[]>('GET', '/push/recent'),
    markNotificationsRead: (ids?: number[]) =>
        request<void>('POST', '/push/notifications/read', ids ? {ids} : {}),
    remindDebtors: () => request<{ reminded_count: number }>('POST', '/club/remind-debtors'),
    regenerateIcalToken: () => request<{ ical_token: string }>('POST', '/club/settings/regenerate-ical-token'),
    getReminderSettings: () => request<ReminderSettings>('GET', '/club/reminder-settings'),
    updateReminderSettings: (d: Partial<ReminderSettings>) => request<{ ok: boolean }>('PATCH', '/club/reminder-settings', d),
    broadcastPush: (d: { title: string; body: string; url?: string }) => request<{ ok: boolean }>('POST', '/club/broadcast-push', d),
    triggerReminders: () => request<{ ok: boolean }>('POST', '/push/trigger-reminders'),

    // Committee (Vergnügungsausschuss)
    listAnnouncements: () => request<ClubAnnouncement[]>('GET', '/committee/announcements'),
    createAnnouncement: (d: { title: string; text?: string }) => request<ClubAnnouncement>('POST', '/committee/announcements', d),
    deleteAnnouncement: (id: number) => request<void>('DELETE', `/committee/announcements/${id}`),
    listTrips: () => request<ClubTrip[]>('GET', '/committee/trips'),
    createTrip: (d: { date: string; destination: string; note?: string }) => request<ClubTrip>('POST', '/committee/trips', d),
    updateTrip: (id: number, d: { date?: string; destination?: string; note?: string }) => request<ClubTrip>('PATCH', `/committee/trips/${id}`, d),
    deleteTrip: (id: number) => request<void>('DELETE', `/committee/trips/${id}`),
    setCommitteeMember: (memberId: number, isCommittee: boolean) =>
        request<{ id: number; is_committee: boolean }>('PATCH', `/club/members/${memberId}/committee`, {is_committee: isCommittee}),

    // Reports — Excel/PDF export (admin only)
    downloadReport: async (year?: number, format: 'xlsx' | 'pdf' = 'xlsx'): Promise<void> => {
        const headers: Record<string, string> = {}
        if (_token) headers['Authorization'] = `Bearer ${_token}`
        const params = new URLSearchParams()
        if (year) params.set('year', String(year))
        if (format !== 'xlsx') params.set('format', format)
        const qs = params.toString() ? `?${params}` : ''
        const res = await fetch(`${API_BASE}/reports/export${qs}`, {headers})
        if (res.status === 401) { authState._fireUnauthorized(); throw new UnauthorizedError() }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const suffix = year ? `_${year}` : ''
        a.download = `kegelkasse_report${suffix}.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    },

    // Backups — pgbackrest (superadmin only)
    listBackups: () => request<{
        info: PgBackrestStanza[];
        config: {
            schedule: string; retain_full: number; mgmt_url: string;
            repo_type?: string; s3_bucket?: string; s3_region?: string; s3_endpoint?: string;
        };
    }>('GET', '/backups'),
    createBackup: () => request<{ ok: boolean; info: PgBackrestStanza[] }>('POST', '/backups'),
    deleteBackup: (label: string) => request<{ ok: boolean }>('DELETE', `/backups/${encodeURIComponent(label)}`),
    downloadBackup: async (label: string): Promise<void> => {
        const headers: Record<string, string> = {}
        if (_token) headers['Authorization'] = `Bearer ${_token}`
        const res = await fetch(`${API_BASE}/backups/${encodeURIComponent(label)}/download`, {headers})
        if (res.status === 401) { authState._fireUnauthorized(); throw new UnauthorizedError() }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `backup-${label}.tar.gz`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    },
}

/**
 * Flush all queued offline mutations in timestamp order.
 * Returns the number of successfully applied changes and any errors.
 */
export async function flushOfflineQueue(): Promise<{ applied: number; errors: number }> {
    const queued = await offlineQueue.getAll()
    if (queued.length === 0) return {applied: 0, errors: 0}

    const sorted = [...queued].sort((a, b) => a.timestamp - b.timestamp)
    let applied = 0
    let errors = 0

    _bypassQueue = true
    try {
        for (const item of sorted) {
            try {
                await request<unknown>(item.method, item.path, item.body)
                if (item.id !== undefined) await offlineQueue.remove(item.id)
                applied++
            } catch (e) {
                if (e instanceof NetworkError) {
                    // Still offline — stop flushing
                    break
                }
                // Server rejected (404, conflict, etc.) — discard and continue
                if (item.id !== undefined) await offlineQueue.remove(item.id)
                errors++
            }
        }
    } finally {
        _bypassQueue = false
    }

    window.dispatchEvent(new CustomEvent('kegelkasse:queue-changed'))
    if (applied > 0) {
        window.dispatchEvent(new CustomEvent('kegelkasse:sync-flushed', {detail: {applied}}))
    }
    return {applied, errors}
}
