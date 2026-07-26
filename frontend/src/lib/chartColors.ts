/**
 * Shared per-player chart palette.
 *
 * Lives outside the pages so the Stats page and the Statistik-Labor components colour the same
 * member identically across every chart they render.
 */

// 20 distinct Tailwind colours — no amber (reserved for app primary / "me" highlight).
// Ordered for max visual spread across the first 8–10 slots (most clubs).
export const PLAYER_COLORS = [
    '#22c55e', '#60a5fa', '#ec4899', '#a78bfa', '#34d399',
    '#14b8a6', '#f43f5e', '#f97316', '#84cc16', '#06b6d4',
    '#8b5cf6', '#d946ef', '#ef4444', '#0ea5e9', '#6366f1',
    '#10b981', '#a855f7', '#fb7185', '#4ade80', '#818cf8',
]

export const playerColor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length]

// 13%-opacity tint: hex colors get '#rrggbb22', amber CSS variable gets rgba()
export const withAlpha = (col: string) =>
    col.startsWith('#') ? col + '22' : 'rgba(232,160,32,0.13)'
