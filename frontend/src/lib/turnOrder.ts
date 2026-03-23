import type {EveningPlayer, Team} from '@/types.ts'

/** Build the circular throw-order list based on mode. */
export function buildTurnOrder(
    players: EveningPlayer[],
    teams: Team[],
    mode: 'alternating' | 'block',
    blockTeamIdx: number,
): EveningPlayer[] {
    const teamsWithPlayers = teams.map(t => players.filter(p => p.team_id === t.id))

    if (teams.length === 0) return [...players]

    if (mode === 'block') {
        return teamsWithPlayers[blockTeamIdx % teams.length] ?? []
    }

    // alternating: interleave team players
    const maxLen = Math.max(...teamsWithPlayers.map(t => t.length), 0)
    const result: EveningPlayer[] = []
    for (let i = 0; i < maxLen; i++) {
        for (const team of teamsWithPlayers) {
            if (i < team.length) result.push(team[i])
        }
    }
    return [...result, ...players.filter(p => p.team_id === null)]
}
