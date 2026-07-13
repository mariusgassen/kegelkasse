// ── Domain types — mirrors backend models ──

export interface NotificationItem {
    id: string
    title: string
    body: string
    url: string
    receivedAt: string  // ISO timestamp
    read: boolean
    serverLogId?: number  // set when loaded from the server notification log (for deduplication)
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
    comments: boolean
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
    auto_report: ReminderTypeSettings
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
    is_committee: boolean
    avatar: string | null
}

export interface ClubAnnouncement {
    id: number
    title: string
    text: string | null
    media_url: string | null
    created_by_name: string | null
    created_at: string | null
}

export interface ClubTrip {
    id: number
    date: string  // YYYY-MM-DDTHH:MM (UTC)
    destination: string
    note: string | null
    created_by_name: string | null
    created_at: string | null
}

export interface PollOption {
    id: number
    text: string
    sort_order: number
    vote_count: number
    voted_by_me: boolean
}

export interface ClubPoll {
    id: number
    title: string
    text: string | null
    mode: 'single' | 'multi'
    is_closed: boolean
    created_by_name: string | null
    created_at: string | null
    options: PollOption[]
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

export type WinnerType = 'team' | 'individual'
export type TurnMode = 'alternating' | 'block'

export interface GameTemplate {
    id: number
    name: string
    description: string | null
    winner_type: WinnerType
    turn_mode: TurnMode | null
    is_opener: boolean
    default_loser_penalty: number
    per_point_penalty: number
    sort_order: number
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
    nickname: string | null
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

export interface GameThrowLog {
    id: number
    throw_num: number
    pins: number
    cumulative: number | null
    pin_states: boolean[]
    player_id: number | null
}

export interface EveningThrowSummary {
    evening_id: number
    date: string
    location: string | null
    total_pins: number
    throw_count: number
    avg_pins: number
}

export interface ThrowStats {
    regular_member_id: number | null
    year: number | null
    total_pins: number
    throw_count: number
    avg_pins: number | null
    best_avg: number | null
    worst_avg: number | null
    evenings: EveningThrowSummary[]
}

export interface CorrelationEveningPoint {
    evening_id: number
    date: string
    penalty_euro: number
    drink_count: number
}

export interface CorrelationMemberPoint {
    regular_member_id: number
    name: string
    nickname: string | null
    evenings_count: number
    total_penalty_euro: number
    total_drink_count: number
    personal_pearson_r: number | null
    evening_points: CorrelationEveningPoint[]
}

export interface CorrelationStats {
    year: number
    overall_pearson_r: number | null
    evenings: CorrelationEveningPoint[]
    members: CorrelationMemberPoint[]
}

export interface EveningCorrelationBin {
    t: string
    delta_penalty: number
    delta_drinks: number
    cum_penalty: number
    cum_drinks: number
}

export interface EveningCorrelationMember {
    regular_member_id: number | null
    evening_player_id: number
    name: string
    nickname: string | null
    bins: EveningCorrelationBin[]
    derivative_pearson_r: number | null
}

export interface EveningCorrelation {
    evening_id: number
    date: string
    bin_minutes: number
    members: EveningCorrelationMember[]
}

export interface Game {
    id: number
    name: string
    template_id: number | null
    is_opener: boolean
    winner_type: WinnerType
    turn_mode: TurnMode | null
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
    active_player_id: number | null
    throws: GameThrowLog[]
    _pendingStart?: boolean
    _pendingFinish?: boolean
}

export interface DrinkRound {
    id: number
    drink_type: 'beer' | 'shots'
    variety: string | null
    participant_ids: number[]
    client_timestamp: number
}

export interface EveningHighlight {
    id: number
    text: string | null
    media_url: string | null
    created_at: string | null
}

export interface CommentReaction {
    emoji: string
    count: number
    reacted_by_me: boolean
}

export interface Comment {
    id: number
    text: string | null
    media_url: string | null
    parent_comment_id: number | null
    created_by_id: number | null
    created_by_name: string | null
    created_by_avatar: string | null
    created_at: string | null
    edited_at: string | null
    reactions: CommentReaction[]
    replies: Comment[]
}

export interface ItemReaction {
    emoji: string
    count: number
    reacted_by_me: boolean
}

export interface Evening {
    id: number
    date: string
    venue: string | null
    note: string | null
    is_closed: boolean
    ended_at: string | null
    season_closed: boolean
    players: EveningPlayer[]
    teams: Team[]
    penalty_log: PenaltyLogEntry[]
    games: Game[]
    drink_rounds: DrinkRound[]
    highlights: EveningHighlight[]
}

// ── Helper types ──

export type PenaltyMode = 'euro' | 'count'

export interface EveningListItem {
    id: number
    date: string
    venue: string | null
    is_closed: boolean
    season_closed: boolean
    player_count: number
    game_count: number
    penalty_total: number
    drink_total: number
}

// pgbackrest info output types
export interface PgBackrestBackup {
    label: string           // e.g. "20260321-020000F"
    type: 'full' | 'diff' | 'incr'
    timestamp: { start: number; stop: number }
    info: { size: number; delta: number; repository: { size: number; delta: number } }
    archive: { start: string; stop: string }
    error: boolean
}

export interface PgBackrestArchive {
    id: string
    min: string
    max: string
}

export interface PgBackrestStanza {
    name: string
    status: { code: number; message: string }
    backup: PgBackrestBackup[]
    archive: PgBackrestArchive[]
}


export interface SeasonSnapshot {
    id: number
    year: number
    closed_at: string
    closed_by_name: string | null
    member_count: number
    evening_count: number
    carry_over_count: number
    total_penalties: number
    total_payments: number
    ranking_data: Record<string, unknown>[] | null
    notes: string | null
}
