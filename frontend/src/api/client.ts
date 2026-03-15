import {
    Club,
    ClubSettings,
    DrinkRound,
    Evening,
    EveningListItem,
    EveningPlayer,
    GameTemplate,
    PenaltyLogEntry,
    PenaltyType,
    RegularMember,
    Team,
    User
} from '@/types';

const API_BASE = '/api/v1'
let _token: string | null = localStorage.getItem('kegelkasse_token')

export const authState = {
    setToken(t: string | null) {
        _token = t
        if (t) localStorage.setItem('kegelkasse_token', t)
        else localStorage.removeItem('kegelkasse_token')
    },
    getToken: () => _token,
    isLoggedIn: () => !!_token,
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {'Content-Type': 'application/json'}
    if (_token) headers['Authorization'] = `Bearer ${_token}`
    const res = await fetch(API_BASE + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
    })
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
    updateProfile: (d: { name?: string; username?: string; email?: string; current_password?: string; new_password?: string }) =>
        request<User>('PATCH', '/auth/profile', d),
    updateAvatar: (avatar: string | null) => request<User>('PATCH', '/auth/avatar', {avatar}),
    createInvite: () => request<{ token: string; expires_at: string; invite_url: string }>('POST', '/auth/invite'),
    getInviteInfo: (token: string) =>
        request<{ valid: boolean; member_name: string | null }>('GET', `/auth/invite-info?token=${token}`),
    register: (token: string, pw: string, username: string, name?: string) =>
        request<{ access_token: string; user: User }>('POST', '/auth/register', {
            token, password: pw, username, ...(name ? {name} : {})
        }),

    // Club
    getClub: () => request<Club>('GET', '/club/'),
    updateClubSettings: (d: Partial<ClubSettings> & { name?: string }) => request<void>('PATCH', '/club/settings', d),
    getMembers: () => request<{ id: number; name: string; role: string }[]>('GET', '/club/members'),
    updateMemberRole: (id: number, role: string) => request<void>('PATCH', `/club/members/${id}/role?role=${role}`),

    // Superadmin
    listAllClubs: () => request<{ id: number; name: string; slug: string; member_count: number; is_active: boolean }[]>('GET', '/superadmin/clubs'),
    createClub: (name: string) => request<{ id: number; name: string; slug: string; member_count: number; is_active: boolean }>('POST', '/superadmin/clubs', {name}),
    switchClub: (clubId: number) => request<{ access_token: string; user: User }>('POST', `/superadmin/switch-club/${clubId}`),

    // Regular members (Stammspieler)
    createMemberInvite: (mid: number) =>
        request<{ token: string; invite_url: string; member_name: string }>('POST', `/club/regular-members/${mid}/invite`),
    listRegularMembers: () => request<RegularMember[]>('GET', '/club/regular-members'),
    createRegularMember: (d: { name: string; nickname?: string }) =>
        request<RegularMember>('POST', '/club/regular-members', d),
    updateRegularMember: (id: number, d: { name: string; nickname?: string }) =>
        request<RegularMember>('PUT', `/club/regular-members/${id}`, d),
    deleteRegularMember: (id: number) => request<void>('DELETE', `/club/regular-members/${id}`),

    // Penalty types
    listPenaltyTypes: () => request<PenaltyType[]>('GET', '/club/penalty-types'),
    createPenaltyType: (d: { icon: string; name: string; default_amount: number; sort_order: number }) =>
        request<PenaltyType>('POST', '/club/penalty-types', d),
    updatePenaltyType: (id: number, d: { icon: string; name: string; default_amount: number; sort_order: number }) =>
        request<PenaltyType>('PUT', `/club/penalty-types/${id}`, d),
    deletePenaltyType: (id: number) => request<void>('DELETE', `/club/penalty-types/${id}`),

    // Game templates
    listGameTemplates: () => request<GameTemplate[]>('GET', '/club/game-templates'),
    createGameTemplate: (d: {
        name: string;
        description?: string;
        winner_type: string;
        is_opener: boolean;
        default_loser_penalty: number;
        sort_order: number
    }) =>
        request<GameTemplate>('POST', '/club/game-templates', d),
    updateGameTemplate: (id: number, d: {
        name: string;
        description?: string;
        winner_type: string;
        is_opener: boolean;
        default_loser_penalty: number;
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
        client_timestamp: number
    }) =>
        request<PenaltyLogEntry[]>('POST', `/evening/${eid}/penalties`, d),
    updatePenalty: (eid: number, lid: number, d: {
        player_id?: number;
        penalty_type_name?: string;
        amount?: number;
        mode?: string
    }) =>
        request<void>('PATCH', `/evening/${eid}/penalties/${lid}`, d),
    deletePenalty: (eid: number, lid: number) => request<void>('DELETE', `/evening/${eid}/penalties/${lid}`),

    // Games
    addGame: (eid: number, d: {
        name: string;
        template_id?: number;
        is_opener?: boolean;
        winner_type?: string;
        winner_ref?: string;
        winner_name?: string;
        scores?: Record<string, number>;
        loser_penalty?: number;
        note?: string;
        sort_order?: number;
        client_timestamp: number
    }) =>
        request<{ id: number; name: string }>('POST', `/evening/${eid}/games`, d),
    updateGame: (eid: number, gid: number, d: Partial<{
        name: string;
        is_opener: boolean;
        winner_ref: string;
        winner_name: string;
        scores: Record<string, number>;
        loser_penalty: number;
        note: string
    }>) =>
        request<void>('PATCH', `/evening/${eid}/games/${gid}`, d),
    deleteGame: (eid: number, gid: number) => request<void>('DELETE', `/evening/${eid}/games/${gid}`),

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

    // Stats
    getYearStats: (year: number) => request<{
        year: number;
        evening_count: number;
        total_penalties: number;
        players: any[]
    }>('GET', `/stats/year/${year}`),

    // Sync
    sync: (payload: { client_id: string; last_sync?: number; changes: any[] }) =>
        request<{ applied: number; errors: any[]; server_timestamp: number }>('POST', '/sync/', payload),
}
