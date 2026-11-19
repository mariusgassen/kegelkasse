import {useState, useMemo} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Check, Plus, Search, Shield} from 'lucide-react'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {showToast} from '@/components/ui/Toast'
import {toastError} from '@/utils/error'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {Empty} from '@/components/ui/Empty'
import type {UserRole} from '@/types'

const ROLE_CONFIG: {
    role: UserRole
    labelKey: string
    activeClass: string
    inactiveClass: string
}[] = [
    {
        role: 'superadmin',
        labelKey: 'role.superadmin',
        activeClass: 'bg-danger-tint text-danger border-danger/40',
        inactiveClass: 'text-muted border-line hover:text-danger hover:border-danger/30',
    },
    {
        role: 'it_admin',
        labelKey: 'role.it_admin',
        activeClass: 'bg-accent-tint text-accent-tint-fg border-accent/40',
        inactiveClass: 'text-muted border-line hover:text-accent hover:border-accent/30',
    },
    {
        role: 'admin',
        labelKey: 'role.admin',
        activeClass: 'bg-warn-tint text-warn border-warn/40',
        inactiveClass: 'text-muted border-line hover:text-warn hover:border-warn/30',
    },
    {
        role: 'treasurer',
        labelKey: 'role.treasurer',
        activeClass: 'bg-ok-tint text-ok border-ok/40',
        inactiveClass: 'text-muted border-line hover:text-ok hover:border-ok/30',
    },
    {
        role: 'auditor',
        labelKey: 'role.auditor',
        activeClass: 'bg-accent-tint text-accent-tint-fg border-accent/40',
        inactiveClass: 'text-muted border-line hover:text-accent hover:border-accent/30',
    },
    {
        role: 'committee',
        labelKey: 'role.committee',
        activeClass: 'bg-accent-tint text-accent-tint-fg border-accent/40',
        inactiveClass: 'text-muted border-line hover:text-accent hover:border-accent/30',
    },
    {
        role: 'zeugwart',
        labelKey: 'role.zeugwart',
        activeClass: 'bg-accent-tint text-accent-tint-fg border-accent/40',
        inactiveClass: 'text-muted border-line hover:text-accent hover:border-accent/30',
    },
]

export function SuperadminRolesManager() {
    const t = useT()
    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const [updatingId, setUpdatingId] = useState<number | null>(null)

    const {data: users = [], isLoading} = useQuery({
        queryKey: ['superadmin-users'],
        queryFn: api.superadminListUsers,
    })

    const getUserRoles = (u: {role: UserRole; roles?: UserRole[]}): UserRole[] => {
        if (u.roles && Array.isArray(u.roles) && u.roles.length > 0) {
            return u.roles
        }
        return u.role ? [u.role] : ['member']
    }

    const filteredUsers = useMemo(() => {
        const activeUsers = users.filter(u => u.is_active !== false)
        if (!search.trim()) return activeUsers
        const q = search.toLowerCase().trim()
        return activeUsers.filter(u => {
            const uRoles = getUserRoles(u)
            return (
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (u.club_name && u.club_name.toLowerCase().includes(q)) ||
                uRoles.some(r => r.toLowerCase().includes(q))
            )
        })
    }, [users, search])

    const handleToggleRole = async (userId: number, currentRoles: UserRole[], roleToToggle: UserRole) => {
        setUpdatingId(userId)
        const has = currentRoles.includes(roleToToggle)
        let nextRoles: UserRole[]
        if (has) {
            nextRoles = currentRoles.filter(r => r !== roleToToggle)
            if (nextRoles.length === 0) {
                nextRoles = ['member']
            }
        } else {
            nextRoles = [...currentRoles.filter(r => r !== 'member'), roleToToggle]
        }

        try {
            const res = await api.superadminSetUserRoles(userId, nextRoles)
            showToast(`✓ ${t('superadmin.roles.updated')}`)
            qc.setQueryData<typeof users>(['superadmin-users'], old =>
                old ? old.map(u => u.id === userId ? {...u, role: res.role, roles: res.roles} : u) : old
            )
        } catch (err) {
            toastError(err)
        } finally {
            setUpdatingId(null)
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                    <Shield className="w-4 h-4 text-accent" />
                    <span>{t('superadmin.roles.title')}</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                    {t('superadmin.roles.subtitle')}
                </p>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t('superadmin.roles.search')}
                    className="w-full bg-surface-2 border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                />
            </div>

            {isLoading ? (
                <SkeletonRows rows={4} />
            ) : filteredUsers.length === 0 ? (
                <Empty icon="👥" text={t('superadmin.roles.empty')} />
            ) : (
                <div className="space-y-2">
                    {filteredUsers.map(u => {
                        const uRoles = getUserRoles(u)
                        const isPlainMember = !ROLE_CONFIG.some(rc => uRoles.includes(rc.role))

                        return (
                            <div
                                key={u.id}
                                className="kce-card p-3 border border-line rounded-xl flex flex-col gap-2.5"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-ink truncate">{u.name}</span>
                                            {isPlainMember && (
                                                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line">
                                                    {t('superadmin.roles.role.member')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted truncate">
                                            {u.email} {u.club_name ? `· ${u.club_name}` : ''}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-line/50">
                                    <span className="text-xs font-medium text-muted mr-1">
                                        {t('superadmin.roles.role')}:
                                    </span>
                                    {ROLE_CONFIG.map(({role, labelKey, activeClass, inactiveClass}) => {
                                        const isActive = uRoles.includes(role)
                                        const clubAdminCount = u.club_id != null
                                            ? users.filter(x => x.is_active !== false && x.club_id === u.club_id && getUserRoles(x).includes('admin')).length
                                            : 0
                                        const isLastClubAdmin = role === 'admin' && isActive && u.club_id != null && clubAdminCount <= 1
                                        const isDisabled = updatingId === u.id || isLastClubAdmin
                                        return (
                                            <button
                                                key={role}
                                                type="button"
                                                disabled={isDisabled}
                                                onClick={() => handleToggleRole(u.id, uRoles, role)}
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                                                    isActive
                                                        ? `${activeClass} shadow-xs`
                                                        : `bg-surface-2 ${inactiveClass}`
                                                } ${
                                                    isDisabled
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : 'cursor-pointer active:scale-95'
                                                }`}
                                            >
                                                {isActive ? (
                                                    <Check className="w-3 h-3 flex-shrink-0" />
                                                ) : (
                                                    <Plus className="w-3 h-3 flex-shrink-0 opacity-60" />
                                                )}
                                                <span>{t(labelKey as Parameters<typeof t>[0])}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

