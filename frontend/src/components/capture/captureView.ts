import type {CaptureController} from '@/hooks/useCaptureController.ts'
import type {Evening, PenaltyLogEntry} from '@/types.ts'

/** Euro value of one log entry; count entries carry their price per piece. */
export function entryValue(entry: PenaltyLogEntry): number {
    return entry.mode === 'euro' ? entry.amount : entry.amount * (entry.unit_amount ?? 0)
}

/** A row of the "booked to this selection" or "collected" list. */
export interface CaptureLine {
    key: string
    icon: string
    name: string
    count: number
    value: number
    playerId: number | null
    /** Absent while the booking is still on its way. */
    remove?: () => void
}

/** What has been booked to the standing selection, including bookings that are still being saved. */
export function sessionLines(capture: CaptureController, evening: Evening | null | undefined): CaptureLine[] {
    return capture.session.flatMap<CaptureLine>(ts => {
        const saved = (evening?.penalty_log ?? []).filter(l => l.client_timestamp === ts)
        if (saved.length) {
            return saved.map(l => ({
                key: `e${l.id}`, icon: l.icon, name: l.penalty_type_name, count: l.amount,
                value: entryValue(l), playerId: l.player_id,
                remove: () => { capture.removeEntry(l.id, 'penalty') },
            }))
        }
        return capture.saving.filter(s => s.ts === ts).flatMap(s => s.playerIds.map(playerId => ({
            key: `s${ts}-${playerId}`, icon: s.type.icon, name: s.type.name, count: s.count,
            value: s.type.default_amount * s.count, playerId,
        })))
    })
}

/** How often each penalty type shows on the pad: for the selection what is booked, else what is collected. */
export function padCounts(capture: CaptureController, lines: CaptureLine[], typeIdByName: Map<string, number>) {
    const counts = new Map<number, number>()
    const add = (id: number, n: number) => counts.set(id, (counts.get(id) ?? 0) + n)
    if (capture.state.selected.length) {
        // With several people every one of them has the same bookings: count one person's
        const first = lines[0]?.playerId
        for (const line of lines) {
            const id = typeIdByName.get(line.name)
            if (id != null && line.playerId === first) add(id, line.count)
        }
    } else {
        for (const id of capture.state.tray) add(id, 1)
    }
    return counts
}
