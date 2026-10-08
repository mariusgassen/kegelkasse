/** Date helpers for Kegelfahrten, which may span several days (optional `end_date`). */

const dayPart = (iso: string) => (iso.length > 10 ? iso.slice(0, 10) : iso)

function formatDay(iso: string, locale: string): string {
    return new Date(dayPart(iso) + 'T00:00:00').toLocaleDateString(locale, {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

/** True when the trip really spans more than one calendar day. */
export function isMultiDay(date: string, endDate: string | null): boolean {
    return !!endDate && dayPart(endDate) > dayPart(date)
}

/** "Sa., 10.08.2025" for a single day, "Sa., 10.08.2025 – Mo., 12.08.2025" for a range. */
export function formatTripRange(date: string, endDate: string | null, locale = 'de-DE'): string {
    if (!isMultiDay(date, endDate)) return formatDay(date, locale)
    return `${formatDay(date, locale)} – ${formatDay(endDate as string, locale)}`
}

/** Last day of the trip as a YYYY-MM-DD string (start day for single-day trips). */
export function tripLastDay(date: string, endDate: string | null): string {
    return isMultiDay(date, endDate) ? dayPart(endDate as string) : dayPart(date)
}

/** A trip is over once its last day has passed (so a running multi-day trip is still "upcoming"). */
export function isTripPast(date: string, endDate: string | null, now: Date = new Date()): boolean {
    const last = new Date(tripLastDay(date, endDate) + 'T23:59:59Z')
    return last < now
}
