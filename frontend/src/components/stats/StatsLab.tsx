/**
 * 📊 Statistik-Labor (#68) — the opt-in analysis destination.
 *
 * The Abend and Jahr tabs stay glance-level ("what happened", "who leads"); everything that
 * needs a deliberate visit lives here: club records, head-to-head, season comparison and the
 * penalties × drinks correlation machinery that used to be wedged into both other tabs.
 */
import {useState} from 'react'
import {useT} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
import {ClubRecords} from '@/components/stats/ClubRecords.tsx'
import {HeadToHead} from '@/components/stats/HeadToHead.tsx'
import {SeasonComparison} from '@/components/stats/SeasonComparison.tsx'
import {CorrelationSection, EveningCorrelationPanel} from '@/components/stats/CorrelationSection.tsx'
import type {H2HPlayer} from '@/lib/statsLab.ts'

type EveningOption = { id: number; date: string; venue: string | null }

function Section({icon, titleKey, children}: {
    icon: string
    titleKey: TranslationKey
    children: React.ReactNode
}) {
    const t = useT()
    return (
        <div className="mb-2">
            <div className="sec-heading text-sm mt-4">{icon} {t(titleKey)}</div>
            {children}
        </div>
    )
}

export function StatsLab({year, players, evenings, myMemberId, onSelectYear, onSelectMember}: {
    year: number
    players: H2HPlayer[]
    evenings: EveningOption[]
    myMemberId?: number | null
    onSelectYear?: (year: number) => void
    onSelectMember?: (memberId: number) => void
}) {
    const t = useT()
    // Newest evening by default — the one people are most likely to want to dissect.
    const [eveningId, setEveningId] = useState<number | null>(null)
    const effectiveEveningId = eveningId ?? evenings[0]?.id ?? null

    const fDate = (d: string) =>
        new Date(d).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})

    return (
        <div data-testid="stats-lab">
            <Section icon="🏅" titleKey="stats.records.title">
                <ClubRecords myMemberId={myMemberId} onSelectMember={onSelectMember}/>
            </Section>

            <Section icon="⚔️" titleKey="stats.h2h.title">
                <HeadToHead players={players} myMemberId={myMemberId}/>
            </Section>

            <Section icon="📊" titleKey="stats.seasons.title">
                <SeasonComparison selectedYear={year} onSelectYear={onSelectYear}/>
            </Section>

            {/* Both correlation panels bring their own card header, so they are not wrapped
                in a Section — that would render the heading twice. */}
            <CorrelationSection year={year} myMemberId={myMemberId} t={t}/>

            {evenings.length === 0 ? (
                <Empty icon="🎳" text={t('stats.noData')}/>
            ) : (
                <>
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider mt-4 mb-1">
                        {t('stats.correlation.selectEvening')}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{scrollbarWidth: 'none'}}>
                        {evenings.map(e => (
                            <button key={e.id} type="button"
                                    data-testid={`lab-evening-${e.id}`}
                                    className={`chip flex-shrink-0 ${e.id === effectiveEveningId ? 'active' : ''}`}
                                    onClick={() => setEveningId(e.id)}>
                                {fDate(e.date)}{e.venue ? ` · ${e.venue}` : ''}
                            </button>
                        ))}
                    </div>
                    <EveningCorrelationPanel
                        eveningId={effectiveEveningId}
                        myMemberId={myMemberId}
                        t={t}
                    />
                </>
            )}
        </div>
    )
}
