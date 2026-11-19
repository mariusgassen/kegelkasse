import {hasRole, isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import type {UserRole} from '@/types'

/** Renders children only if current user has one of the required roles (defaults to admin/superadmin). Shows lock message otherwise. */
export function AdminGuard({children, roles}: { children: React.ReactNode; roles?: UserRole[] }) {
    const user = useAppStore(s => s.user)
    const t = useT()
    const allowed = roles && roles.length > 0
        ? roles.some(r => hasRole(user, r))
        : isAdmin(user)
    if (allowed) return <>{children}</>
    return (
        <div className="text-center py-10 text-muted">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-sm font-bold">{t('club.adminOnly')}</p>
        </div>
    )
}
