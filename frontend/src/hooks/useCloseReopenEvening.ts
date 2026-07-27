import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {toastError} from '@/utils/error.ts'
import {dateTimeInputToIso, nowDateTimeInput, toDateTimeInput} from '@/lib/datetime.ts'

/**
 * Shared close/reopen-evening logic for EveningHubPage and EveningPage.
 * Canonical close behavior: clears activeEveningId and invalidates both
 * ['evenings'] and ['schedule'] so SchedulePage doesn't show a stale
 * "active evening" card (see CLAUDE.md roadmap #26).
 */
export function useCloseReopenEvening(eveningId: number | undefined, invalidate: () => void) {
    const qc = useQueryClient()
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const [closeConfirm, setCloseConfirm] = useState(false)
    const [closing, setClosing] = useState(false)
    const [closeEndedAt, setCloseEndedAt] = useState('')

    // Open the close-confirm dialog, prefilling the end-time picker with the evening's
    // previously saved ended_at (kept across reopen) or now — in local wall-clock time, which
    // is the only thing a <input type="datetime-local"> can show. Submitting sends a
    // timezone-aware ISO string, because the backend reads a naive timestamp as UTC.
    function openCloseConfirm(currentEndedAt?: string | null) {
        setCloseEndedAt(currentEndedAt ? toDateTimeInput(currentEndedAt) : nowDateTimeInput())
        setCloseConfirm(true)
    }

    async function confirmClose() {
        if (!eveningId) return
        setClosing(true)
        try {
            await api.updateEvening(eveningId, {is_closed: true, ended_at: dateTimeInputToIso(closeEndedAt)})
            setCloseConfirm(false)
            setActiveEveningId(null)
            qc.invalidateQueries({queryKey: ['evenings']})
            qc.invalidateQueries({queryKey: ['schedule']})
            invalidate()
        } catch (e) {
            toastError(e)
        } finally {
            setClosing(false)
        }
    }

    async function reopen() {
        if (!eveningId) return
        setClosing(true)
        try {
            await api.updateEvening(eveningId, {is_closed: false})
            qc.invalidateQueries({queryKey: ['evenings']})
            invalidate()
        } catch (e) {
            toastError(e)
        } finally {
            setClosing(false)
        }
    }

    return {closeConfirm, setCloseConfirm, closing, closeEndedAt, setCloseEndedAt, openCloseConfirm, confirmClose, reopen}
}
