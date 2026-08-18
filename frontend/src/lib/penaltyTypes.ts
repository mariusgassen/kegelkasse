import type {PenaltyType} from '@/types'

/**
 * The one ordering rule for penalty types: cheapest first, then alphabetically.
 *
 * There used to be a `sort_order` column, but nothing in the UI ever set it (create hardcoded 99),
 * so the quick-entry grid came out in effectively arbitrary order while the tablet view grouped by
 * price — two views of the same list disagreeing. Price is what a member scans for at the lane, and
 * the name breaks the tie deterministically.
 *
 * The API already returns this order; this helper exists for the client-side spots that build or
 * extend the list themselves (an optimistic insert after saving a custom penalty as a template, and
 * the tablet's price grouping), so a locally added entry lands where the server would have put it.
 */
export function sortPenaltyTypes<T extends Pick<PenaltyType, 'name' | 'default_amount'>>(types: T[]): T[] {
    return [...types].sort((a, b) => a.default_amount - b.default_amount || a.name.localeCompare(b.name))
}
