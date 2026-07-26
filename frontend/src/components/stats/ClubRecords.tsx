/**
 * 🏅 Vereinsrekorde — all-time club records from `GET /stats/records` (#68).
 *
 * Records the club has no data for yet are omitted server-side, so everything that arrives
 * here is renderable. Throw-based records are additionally hidden when the club has camera
 * throw tracking switched off (#78).
 */
import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {useThrowTracking} from '@/hooks/useClub.ts'
import {visibleRecords} from '@/lib/statsLab.ts'
import type {ClubRecord} from '@/types'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})
}

function formatValue(r: ClubRecord, t: (k: TranslationKey) => string): string {
    switch (r.unit) {
        case 'eur':
            return fe(r.value)
        case 'pins':
            return `Ø ${r.value}`
        default:
            return `${r.value}${r.key === 'longest_streak' ? ` ${t('stats.evenings')}` : ''}`
    }
}

export function ClubRecords({myMemberId, onSelectMember}: {
    myMemberId?: number | null
    onSelectMember?: (memberId: number) => void
}) {
    const t = useT()
    const throwTracking = useThrowTracking()
    const {data, isLoading} = useQuery({
        queryKey: ['stats-records'],
        queryFn: api.getClubRecords,
        staleTime: 1000 * 60 * 5,
    })

    if (isLoading && !data) return <SkeletonRows rows={3}/>

    const records = visibleRecords(data?.records ?? [], throwTracking)
    if (records.length === 0) return <Empty icon="🏅" text={t('stats.records.empty')}/>

    return (
        <div className="mb-4">
            {records.map(r => {
                const isMe = r.holder_member_id != null && r.holder_member_id === myMemberId
                const clickable = r.holder_member_id != null && !!onSelectMember
                const body = (
                    <>
                        <span className="text-2xl flex-shrink-0">{r.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-muted">
                                {t(`stats.records.${r.key}` as TranslationKey)}
                            </div>
                            <div className="text-sm font-bold truncate flex items-center gap-1">
                                {r.holder_name ?? fDate(r.date)}
                                {isMe && <MeBadge/>}
                            </div>
                            {r.holder_name && r.date && (
                                <div className="text-xs text-muted">{fDate(r.date)}</div>
                            )}
                        </div>
                        <div className="text-accent-fg font-bold text-sm flex-shrink-0">
                            {formatValue(r, t)}
                        </div>
                    </>
                )
                const cls = `kce-card p-3 mb-2 flex items-center gap-3 w-full text-left ${isMe ? 'ring-1 ring-accent/40' : ''}`
                return clickable ? (
                    <button key={r.key} type="button" data-testid={`record-${r.key}`}
                            className={`${cls} active:opacity-70 transition-opacity`}
                            onClick={() => onSelectMember!(r.holder_member_id!)}>
                        {body}
                    </button>
                ) : (
                    <div key={r.key} data-testid={`record-${r.key}`} className={cls}>{body}</div>
                )
            })}
        </div>
    )
}
