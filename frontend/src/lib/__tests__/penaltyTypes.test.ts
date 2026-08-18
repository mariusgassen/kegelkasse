import {describe, expect, it} from 'vitest'
import {sortPenaltyTypes} from '../penaltyTypes'

const pt = (name: string, default_amount: number) => ({name, default_amount})

describe('sortPenaltyTypes', () => {
    it('orders by price ascending', () => {
        const sorted = sortPenaltyTypes([pt('Teuer', 5), pt('Billig', 0.1), pt('Mittel', 2)])
        expect(sorted.map(p => p.name)).toEqual(['Billig', 'Mittel', 'Teuer'])
    })

    it('breaks ties alphabetically', () => {
        const sorted = sortPenaltyTypes([pt('Zebra', 1), pt('Anton', 1), pt('Mitte', 1)])
        expect(sorted.map(p => p.name)).toEqual(['Anton', 'Mitte', 'Zebra'])
    })

    it('sorts by price first, name only within a price', () => {
        const sorted = sortPenaltyTypes([pt('Anton', 5), pt('Zebra', 0.5)])
        expect(sorted.map(p => p.name)).toEqual(['Zebra', 'Anton'])
    })

    it('does not mutate the input', () => {
        const input = [pt('Teuer', 5), pt('Billig', 0.1)]
        sortPenaltyTypes(input)
        expect(input.map(p => p.name)).toEqual(['Teuer', 'Billig'])
    })

    it('handles an empty list', () => {
        expect(sortPenaltyTypes([])).toEqual([])
    })
})
