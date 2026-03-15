/**
 * MembersPage — Stammspieler
 * Full implementation uses useActiveEvening(), api.*, Sheet, ChipSelect, ModeToggle.
 * Follows the same patterns as ClubAdminPage and StatsPage.
 * See the previous prototype (kce-react-app.zip) for complete UI implementations
 * of each page — this project adds i18n (useT), renamed API methods, and role guards.
 */
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useT} from '@/i18n'

export function MembersPage() {
    const {evening} = useActiveEvening()
    const t = useT()
    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">👥 {t('nav.members')}</div>
            <div className="text-kce-muted text-sm p-4 kce-card">
                <p className="font-bold mb-1">MembersPage</p>
                <p className="text-xs">Implement using patterns from ClubAdminPage / StatsPage.</p>
                <p className="text-xs mt-1">Active evening: {evening?.id ?? 'none'}</p>
            </div>
        </div>
    )
}
