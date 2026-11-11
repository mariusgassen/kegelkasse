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
    label: string
    activeClass: string
    inactiveClass: string
}[] = [
    {
        role: 'superadmin',
        label: 'Superadmin',
        activeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        inactiveClass: 'text-muted border-line hover:text-purple-300 hover:border-purple-500/30',
    },
    {
        role: 'product_manager',
        label: 'Product Manager',
        activeClass: 'bg-accent-tint text-accent-tint-fg border-accent/40',
        inactiveClass: 'text-muted border-line hover:text-accent hover:border-accent/30',
    },
    {
        role: 'admin',
        label: 'Admin',
        activeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        inactiveClass: 'text-muted border-line hover:text-blue-300 hover:border-blue-500/30',
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
        if (!search.trim()) return users
        const q = search.toLowerCase().trim()
        return users.filter(u => {
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
            showToast(t('superadmin.roles.updated'))
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
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {filteredUsers.map(u => {
                        const uRoles = getUserRoles(u)
                        const isPlainMember =
                            !uRoles.includes('superadmin') &&
                            !uRoles.includes('product_manager') &&
                            !uRoles.includes('admin')

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
                                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-line">
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
                                    <span className="text-[11px] font-medium text-muted mr-1">
                                        {t('superadmin.roles.role')}:
                                    </span>
                                    {ROLE_CONFIG.map(({role, label, activeClass, inactiveClass}) => {
                                        const isActive = uRoles.includes(role)
                                        return (
                                            <button
                                                key={role}
                                                type="button"
                                                disabled={updatingId === u.id}
                                                onClick={() => handleToggleRole(u.id, uRoles, role)}
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                                                    isActive
                                                        ? `${activeClass} shadow-xs`
                                                        : `bg-surface-2 ${inactiveClass}`
                                                } ${
                                                    updatingId === u.id
                                                        ? 'opacity-50 cursor-not-allowed'
                                                        : 'cursor-pointer active:scale-95'
                                                }`}
                                            >
                                                {isActive ? (
                                                    <Check className="w-3 h-3 flex-shrink-0" />
                                                ) : (
                                                    <Plus className="w-3 h-3 flex-shrink-0 opacity-60" />
                                                )}
                                                <span>{label}</span>
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

