/**
 * Evening hub — sub-tab wrapper for Protokoll | Spiele.
 * Evening configuration is accessed separately via the AKTIV header button.
 */
import {useState} from 'react'
import {useT} from '@/i18n'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {PenaltiesPage} from './PenaltiesPage'
import {GamesPage} from './GamesPage'

type SubTab = 'penalties' | 'games'

interface Props {
    onNavigate: () => void
}

export function EveningHubPage({onNavigate}: Props) {
    const t = useT()
    const {activeEveningId} = useActiveEvening()
    const [subTab, setSubTab] = useState<SubTab>('penalties')

    // No active evening — prompt to configure one
    if (!activeEveningId) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">🎳 {t('nav.evening')}</div>
                <div className="kce-card p-5 text-center">
                    <div className="text-2xl mb-3">🎳</div>
                    <div className="text-sm font-bold text-kce-cream mb-1">{t('evening.noActive')}</div>
                    <button className="btn-primary mt-4" onClick={onNavigate}>
                        {t('evening.startButton')}
                    </button>
                </div>
            </div>
        )
    }

    const TABS: { id: SubTab; label: string }[] = [
        {id: 'penalties', label: `📋 ${t('evening.tab.log')}`},
        {id: 'games', label: `🏆 ${t('nav.games')}`},
    ]

    return (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
            {/* Sub-tab strip */}
            <div className="flex gap-1 px-2 pt-2 pb-1.5 flex-shrink-0"
                 style={{background: 'var(--kce-bg)', borderBottom: '1px solid var(--kce-border)'}}>
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${subTab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setSubTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
            </div>

            {/* Sub-pages — always mounted, toggled via display */}
            <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
                <div style={{position: 'absolute', inset: 0, display: subTab === 'penalties' ? 'block' : 'none'}}>
                    <PenaltiesPage/>
                </div>
                <div style={{position: 'absolute', inset: 0, display: subTab === 'games' ? 'block' : 'none'}}>
                    <GamesPage/>
                </div>
            </div>
        </div>
    )
}
