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
