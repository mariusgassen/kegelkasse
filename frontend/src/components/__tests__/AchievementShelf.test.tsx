import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import type {Achievement} from '@/types'

// useT returns the key verbatim so we can assert on i18n keys directly.
vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
}))

import {AchievementShelf} from '@/components/AchievementShelf'

function badge(over: Partial<Achievement>): Achievement {
    return {key: 'first_evening', icon: '🎳', earned: false, tier: null, progress: 0, target: null, ...over}
}

const LIST: Achievement[] = [
    badge({key: 'king', icon: '👑', earned: true, tier: 'bronze', progress: 1, target: 5}),
    badge({key: 'stammgast', icon: '📅', earned: false, tier: null, progress: 4, target: 10}),
]

beforeEach(() => vi.clearAllMocks())

describe('AchievementShelf', () => {
    it('renders the shelf header, count and tap hint', () => {
        render(<AchievementShelf achievements={LIST}/>)
        expect(screen.getByText('achievement.title')).toBeTruthy()
        expect(screen.getByText('1/2')).toBeTruthy() // one earned of two
        expect(screen.getByText('achievement.tapHint')).toBeTruthy()
    })

    it('does not show a detail panel until a badge is tapped', () => {
        render(<AchievementShelf achievements={LIST}/>)
        expect(screen.queryByText('achievement.king.desc')).toBeNull()
    })

    it('reveals the how-to-unlock description when a badge is tapped', () => {
        render(<AchievementShelf achievements={LIST}/>)
        fireEvent.click(screen.getByRole('button', {name: 'achievement.king.title'}))
        expect(screen.getByText('achievement.king.desc')).toBeTruthy()
        expect(screen.getByText(/achievement.status.earned/)).toBeTruthy()
    })

    it('shows locked status + progress for an unearned badge', () => {
        render(<AchievementShelf achievements={LIST}/>)
        fireEvent.click(screen.getByRole('button', {name: 'achievement.stammgast.title'}))
        expect(screen.getByText('achievement.status.locked')).toBeTruthy()
        expect(screen.getByText('4 / 10')).toBeTruthy()
    })

    it('toggles the detail closed when the same badge is tapped again', () => {
        render(<AchievementShelf achievements={LIST}/>)
        const btn = screen.getByRole('button', {name: 'achievement.king.title'})
        fireEvent.click(btn)
        expect(screen.getByText('achievement.king.desc')).toBeTruthy()
        fireEvent.click(btn)
        expect(screen.queryByText('achievement.king.desc')).toBeNull()
    })
})
