import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'

/** Renders children only if current user is admin/superadmin. Shows lock message otherwise. */
export function AdminGuard({children}: { children: React.ReactNode }) {
    const user = useAppStore(s => s.user)
    const t = useT()
    if (isAdmin(user)) return <>{children}</>
    return (
        <div className="text-center py-10 text-kce-muted">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-sm font-bold">{t('club.adminOnly')}</p>
        </div>
    )
}
