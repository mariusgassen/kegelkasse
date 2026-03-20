// ── Domain types — mirrors backend models ──

export interface NotificationItem {
    id: string
    title: string
    body: string
    url: string
    receivedAt: string  // ISO timestamp
    read: boolean
}


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
    regular_member_id: number | null
}

export interface ClubSettings {
    home_venue: string | null
    logo_url: string | null
    primary_color: string
    secondary_color: string
    bg_color: string | null
    guest_penalty_cap: number | null
    paypal_me: string | null
    no_cancel_fee: number | null
    pin_penalty: number | null
    default_evening_time: string | null
    ical_token: string | null
}

export type RsvpStatus = 'attending' | 'absent'

export interface ScheduledEveningGuest {
    id: number
    name: string
    regular_member_id: number | null
}

export interface ScheduledEvening {
    id: number
    scheduled_at: string  // YYYY-MM-DDTHH:MM (UTC)
    venue: string | null
    note: string | null
    created_at: string | null
    attending_count: number
    absent_count: number
    my_rsvp: RsvpStatus | null
    guests: ScheduledEveningGuest[]
    evening_id: number | null  // linked Evening id if already started
}

export interface PushPreferences {
    penalties: boolean
    evenings: boolean
    schedule: boolean
    payments: boolean
    games: boolean
    members: boolean
    reminder_debt: boolean
    reminder_schedule: boolean
    reminder_payments: boolean
    reminder_schedule_days?: number
}

export interface ReminderTypeSettings {
    enabled: boolean
    weekday?: number      // debt_weekly: 0=Mon … 6=Sun
    min_debt?: number     // debt_weekly: minimum debt € to trigger
    days_before?: number  // upcoming_evening / rsvp_reminder
    days_pending?: number // payment_request_nudge
}

export interface ReminderSettings {
    debt_weekly: ReminderTypeSettings
    upcoming_evening: ReminderTypeSettings
    rsvp_reminder: ReminderTypeSettings
    debt_day_of: ReminderTypeSettings
    payment_request_nudge: ReminderTypeSettings
}

export interface RsvpEntry {
    regular_member_id: number
    name: string
    nickname: string | null
    status: RsvpStatus | null  // null = no response
}

export type PaymentRequestStatus = 'pending' | 'confirmed' | 'rejected'

export interface PaymentRequest {
    id: number
    regular_member_id: number
    member_name: string
    amount: number
    note: string | null
    status: PaymentRequestStatus
    created_at: string | null
    resolved_at: string | null
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
    avatar: string | null
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
    is_president_game: boolean
    default_loser_penalty: number
    per_point_penalty: number
    sort_order: number
}

export interface ClubPresident {
    id: number
    year: number
    regular_member_id: number | null
    name: string
    evening_id: number | null
    game_id: number | null
    determined_at: string | null
}

export interface ClubPin {
    id: number
    name: string
    icon: string
    holder_regular_member_id: number | null
    holder_name: string | null
    assigned_at: string | null
}

export interface EveningPlayer {
    id: number
    name: string
    regular_member_id: number | null
    team_id: number | null
    is_king: boolean
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
    unit_amount: number | null
    regular_member_id: number | null
    game_id: number | null
    client_timestamp: number
}

export type GameStatus = 'open' | 'running' | 'finished'

export interface Game {
    id: number
    name: string
    template_id: number | null
    is_opener: boolean
    is_president_game: boolean
    winner_type: WinnerType
    winner_ref: string | null
    winner_name: string | null
    scores: Record<string, number>
    loser_penalty: number
    per_point_penalty: number
    note: string | null
    sort_order: number
    status: GameStatus
    started_at: string | null
    finished_at: string | null
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
