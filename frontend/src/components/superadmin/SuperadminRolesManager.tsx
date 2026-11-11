import {useState, useMemo} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {Search, Shield} from 'lucide-react'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {showToast} from '@/components/ui/Toast'
import {toastError} from '@/utils/error'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {Empty} from '@/components/ui/Empty'
import type {UserRole} from '@/types'

export function SuperadminRolesManager() {
    const t = useT()
    const qc = useQueryClient()
    const [search, setSearch] = useState('')
    const [updatingId, setUpdatingId] = useState<number | null>(null)

    const {data: users = [], isLoading} = useQuery({
        queryKey: ['superadmin-users'],
        queryFn: api.superadminListUsers,
    })

    const filteredUsers = useMemo(() => {
        if (!search.trim()) return users
        const q = search.toLowerCase().trim()
        return users.filter(u =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.club_name && u.club_name.toLowerCase().includes(q)) ||
            u.role.toLowerCase().includes(q)
        )
    }, [users, search])

    const handleRoleChange = async (userId: number, newRole: UserRole) => {
        setUpdatingId(userId)
        try {
            await api.superadminSetUserRole(userId, newRole)
            showToast(t('superadmin.roles.updated'))
            qc.setQueryData<typeof users>(['superadmin-users'], old =>
                old ? old.map(u => u.id === userId ? {...u, role: newRole} : u) : old
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
                    {filteredUsers.map(u => (
                        <div
                            key={u.id}
                            className="kce-card p-3 border border-line rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-ink truncate">{u.name}</span>
                                    {u.role === 'superadmin' && (
                                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                            Superadmin
                                        </span>
                                    )}
                                    {u.role === 'product_manager' && (
                                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-accent-tint text-accent-tint-fg border border-accent/30">
                                            Product Manager
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted truncate">
                                    {u.email} {u.club_name ? `· ${u.club_name}` : ''}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                                <select
                                    value={u.role}
                                    disabled={updatingId === u.id}
                                    onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                                    className="bg-surface-2 border border-line text-ink text-xs font-bold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-accent"
                                >
                                    <option value="member">{t('superadmin.roles.role.member')}</option>
                                    <option value="admin">{t('superadmin.roles.role.admin')}</option>
                                    <option value="product_manager">{t('superadmin.roles.role.product_manager')}</option>
                                    <option value="superadmin">{t('superadmin.roles.role.superadmin')}</option>
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
