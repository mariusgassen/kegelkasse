/** Parse a decimal string that may use either "." or "," as decimal separator. */
export function parseAmount(s: string): number {
    return parseFloat(s.replace(',', '.')) || 0
}
