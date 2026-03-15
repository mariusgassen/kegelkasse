// ── Domain types — mirrors backend models ──

export type UserRole = 'superadmin' | 'admin' | 'member'

export interface User {
    id: number
    email: string
    username: string | null
    name: string
    role: UserRole
    club_id: number | null
    preferred_locale: string
    avatar: string | null
}

export interface ClubSettings {
    home_venue: string | null
    logo_url: string | null
    primary_color: string
    secondary_color: string
    bg_color: string | null
}

export interface Club {
    id: number
    name: string
    slug: string
    settings: ClubSettings
}

export interface RegularMember {
    id: number
    name: string
    nickname: string | null
    is_guest: boolean
    is_active: boolean
}

export interface PenaltyType {
    id: number
    icon: string
    name: string
    default_amount: number
    sort_order: number
}

export interface ClubTeam {
    id: number
    name: string
    sort_order: number
}

export type WinnerType = 'team' | 'individual' | 'either'

export interface GameTemplate {
    id: number
    name: string
    description: string | null
    winner_type: WinnerType
    is_opener: boolean
    default_loser_penalty: number
    sort_order: number
}

export interface EveningPlayer {
    id: number
    name: string
    regular_member_id: number | null
    team_id: number | null
}

export interface Team {
    id: number
    name: string
}

export interface PenaltyLogEntry {
    id: number
    player_id: number | null
    team_id: number | null
    player_name: string
    penalty_type_name: string
    icon: string
    amount: number
    mode: 'euro' | 'count'
    client_timestamp: number
}

export interface Game {
    id: number
    name: string
    template_id: number | null
    is_opener: boolean
    winner_type: WinnerType
    winner_ref: string | null
    winner_name: string | null
    scores: Record<string, number>
    loser_penalty: number
    note: string | null
    sort_order: number
    client_timestamp: number
}

export interface DrinkRound {
    id: number
    drink_type: 'beer' | 'shots'
    variety: string | null
    participant_ids: number[]
    client_timestamp: number
}

export interface Evening {
    id: number
    date: string
    venue: string | null
    note: string | null
    is_closed: boolean
    players: EveningPlayer[]
    teams: Team[]
    penalty_log: PenaltyLogEntry[]
    games: Game[]
    drink_rounds: DrinkRound[]
}

// ── Helper types ──

export type PenaltyMode = 'euro' | 'count'

export interface EveningListItem {
    id: number
    date: string
    venue: string | null
    is_closed: boolean
    player_count: number
}
