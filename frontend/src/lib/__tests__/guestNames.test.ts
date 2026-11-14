import {describe, expect, it} from 'vitest'
import {disambiguatedNames} from '../guestNames'

const labels = (e: Parameters<typeof disambiguatedNames>[0]) => Object.fromEntries(disambiguatedNames(e))

describe('disambiguatedNames', () => {
    it('prefers nickname, falls back to name', () => {
        expect(labels([{id: 1, name: 'Tim Müller', nickname: 'Hammer'}, {id: 2, name: 'Anna Schmidt'}]))
            .toEqual({1: 'Hammer', 2: 'Anna Schmidt'})
    })
    it('uses full names when two nicknames collide', () => {
        expect(labels([{id: 1, name: 'Tim Müller', nickname: 'Tim'}, {id: 2, name: 'Tim Schmidt', nickname: 'Tim'}]))
            .toEqual({1: 'Tim Müller', 2: 'Tim Schmidt'})
    })
    it('collides between a nickname and another guest\'s name', () => {
        expect(labels([{id: 1, name: 'Tim Müller', nickname: 'Tim Schmidt'}, {id: 2, name: 'Tim Schmidt'}]))
            .toEqual({1: 'Tim Müller', 2: 'Tim Schmidt'})
    })
    it('numbers fully identical entries', () => {
        expect(labels([{id: 1, name: 'Tim'}, {id: 2, name: 'Tim'}])).toEqual({1: 'Tim (1)', 2: 'Tim (2)'})
    })
    it('leaves non-colliding entries untouched', () => {
        expect(labels([{id: 1, name: 'Tim Müller', nickname: 'Tim'}, {id: 2, name: 'Tom', nickname: 'Tom'}]))
            .toEqual({1: 'Tim', 2: 'Tom'})
    })
})
