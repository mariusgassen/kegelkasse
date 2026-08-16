/**
 * Pure derivations over club settings.
 *
 * Kept free of React so it can be unit-tested and reused by both the `useThrowTracking` hook and
 * any non-hook call site.
 */
import type {ClubSettings} from '@/types'

/**
 * Whether the club uses camera-based pin/throw tracking (feature #33).
 *
 * Opt-out per club: a club whose bowling machine can't feed throw data turns this off, which hides
 * all throw UI and throw stats. Defaults to `true` when the flag is missing (undefined/null) so
 * clubs that predate the setting keep their existing behaviour — only an explicit `false` disables.
 */
export function throwTrackingEnabled(settings?: Pick<ClubSettings, 'throw_tracking_enabled'> | null): boolean {
    return settings?.throw_tracking_enabled !== false
}

/**
 * Whether audio call-outs (0-pin buzzer + per-PenaltyType sounds) are enabled for the current club.
 * Same default-on-unless-explicitly-false convention as `throwTrackingEnabled` — this is a club-level
 * master switch since call-outs play on a shared/kiosk device, not just one member's phone.
 */
export function audioCalloutsEnabled(settings?: Pick<ClubSettings, 'audio_callouts_enabled'> | null): boolean {
    return settings?.audio_callouts_enabled !== false
}
