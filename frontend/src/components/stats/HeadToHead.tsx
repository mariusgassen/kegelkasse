/**
 * ⚔️ Kopf-an-Kopf — side-by-side comparison of two members for one season (#68).
 *
 * Reads the already-cached `['stats', year]` query, so opening the lab issues no extra
 * request and no new backend endpoint was needed.
 */
import {useMemo, useState} from 'react'
import {useT} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {useThrowTracking} from '@/hooks/useClub.ts'
import {headToHeadRows, type H2HPlayer, type H2HRow} from '@/lib/statsLab.ts'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function formatCell(value: number | null, format: H2HRow['format']): string {
    if (value === null) return '–'
    if (format === 'eur') return fe(value)
    if (format === 'pins') return `Ø ${value}`
    return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const displayName = (p: H2HPlayer) => p.nickname || p.name

export function HeadToHead({players, myMemberId}: {
    players: H2HPlayer[]
    myMemberId?: number | null
}) {
    const t = useT()
    const throwTracking = useThrowTracking()

    // Own account first, per the app-wide sort convention.
    const candidates = useMemo(() => {
        return [...players]
            .filter(p => p.regular_member_id != null)
            .sort((a, b) => {
                if (a.regular_member_id === myMemberId) return -1
                if (b.regular_member_id === myMemberId) return 1
                return 0
            })
    }, [players, myMemberId])

    // Slot ① defaults to the current user (candidates are already sorted own-account-first),
    // so a single tap on any other member already yields a comparison.
    const [aId, setAId] = useState<number | null>(null)
    const [bId, setBId] = useState<number | null>(null)

    if (candidates.length < 2) {
        return <div className="text-xs text-muted py-3 text-center">{t('stats.h2h.notEnough')}</div>
    }

    const effectiveA = aId ?? candidates[0].regular_member_id!
    const a = candidates.find(p => p.regular_member_id === effectiveA) ?? candidates[0]
    const b = bId != null ? candidates.find(p => p.regular_member_id === bId) ?? null : null

    // One tap per pill, no hidden gestures: tapping the opponent slot clears it, tapping the
    // anchor moves the opponent into slot ①, anything else becomes the new opponent.
    const toggle = (id: number) => {
        if (id === bId) {
            setBId(null)
        } else if (id === effectiveA) {
            if (bId != null) {
                setAId(bId)
                setBId(effectiveA)
            }
        } else {
            setBId(id)
        }
    }

    const rows = b ? headToHeadRows(a, b, throwTracking) : []

    return (
        <div className="kce-card p-3 mb-4">
            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                {t('stats.h2h.pickHint')}
            </div>

            {/* Anchor picker */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{scrollbarWidth: 'none'}}>
                {candidates.map(p => {
                    const id = p.regular_member_id!
                    const isA = id === effectiveA
                    const isB = id === bId
                    return (
                        <button key={id} type="button"
                                data-testid={`h2h-pill-${id}`}
                                className={`chip flex-shrink-0 ${isA || isB ? 'active' : ''}`}
                                onClick={() => toggle(id)}>
                            {isA ? '① ' : isB ? '② ' : ''}{displayName(p)}
                            {id === myMemberId && <MeBadge/>}
                        </button>
                    )
                })}
            </div>

            {!b ? (
                <div className="text-xs text-muted py-3 text-center">{t('stats.h2h.pickSecond')}</div>
            ) : (
                <div data-testid="h2h-table">
                    <div className="flex items-center gap-2 mb-2 text-sm font-bold">
                        <div className="flex-1 truncate text-right">{displayName(a)}</div>
                        <div className="text-muted text-xs flex-shrink-0">vs</div>
                        <div className="flex-1 truncate">{displayName(b)}</div>
                    </div>
                    {rows.map(row => (
                        <div key={row.key} className="flex items-center gap-2 py-1.5"
                             style={{borderTop: '1px solid var(--line)'}}>
                            <div className={`flex-1 text-right text-sm font-bold ${row.winner === 'a' ? 'text-accent-fg' : ''}`}>
                                {formatCell(row.a, row.format)}
                            </div>
                            <div className="flex-shrink-0 text-xs text-muted uppercase tracking-wider text-center"
                                 style={{minWidth: 110}}>
                                {t(`stats.h2h.${row.key}` as TranslationKey)}
                            </div>
                            <div className={`flex-1 text-sm font-bold ${row.winner === 'b' ? 'text-accent-fg' : ''}`}>
                                {formatCell(row.b, row.format)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
