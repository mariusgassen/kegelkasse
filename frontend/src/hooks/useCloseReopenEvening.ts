import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {toastError} from '@/utils/error.ts'

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

    async function confirmClose() {
        if (!eveningId) return
        setClosing(true)
        try {
            await api.updateEvening(eveningId, {is_closed: true})
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

    return {closeConfirm, setCloseConfirm, closing, confirmClose, reopen}
}
