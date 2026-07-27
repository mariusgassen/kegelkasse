/**
 * Values for `<input type="date">` and `<input type="datetime-local">`.
 *
 * Both input types speak *local wall-clock* text — the browser shows the picker and its
 * default exactly as written. `new Date().toISOString().slice(0, …)` converts to UTC first,
 * so it hands the field a different clock than the one on the user's wall: a full timezone
 * offset off for a time picker, and a whole day off around midnight for a date picker.
 * These helpers are the local-time replacement for that pattern.
 */

const pad = (n: number) => String(n).padStart(2, '0')

function asDate(value: Date | string | number | null | undefined): Date | null {
    if (value === null || value === undefined || value === '') return null
    const d = value instanceof Date ? value : new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

/** Local `YYYY-MM-DD` for `<input type="date">`; empty string for a missing/invalid value. */
export function toDateInput(value: Date | string | number | null | undefined): string {
    const d = asDate(value)
    if (!d) return ''
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`; empty for a missing value. */
export function toDateTimeInput(value: Date | string | number | null | undefined): string {
    const d = asDate(value)
    if (!d) return ''
    return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Today, as the local date the user's own calendar shows. */
export function todayDateInput(): string {
    return toDateInput(new Date())
}

/** Now, as the local wall-clock time the user's own watch shows. */
export function nowDateTimeInput(): string {
    return toDateTimeInput(new Date())
}

/**
 * Turn a `datetime-local` field value back into a timezone-aware ISO string.
 *
 * The backend's `_parse_date` reads a naive timestamp as UTC, so posting the raw field value
 * would file the user's local wall-clock time under the wrong timezone. Returns `undefined`
 * for an empty field so callers can spread it into an optional payload field.
 */
export function dateTimeInputToIso(value: string): string | undefined {
    const d = asDate(value)
    return d ? d.toISOString() : undefined
}
