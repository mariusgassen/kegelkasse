/**
 * Evening hub — sub-tab wrapper for Abend | Strafen | Spiele.
 * All sub-pages are always mounted (display:none when inactive) to
 * preserve scroll position across tab switches.
 */
import {useState} from 'react'
import {useT} from '@/i18n'
import {EveningPage} from './EveningPage'
import {PenaltiesPage} from './PenaltiesPage'
import {GamesPage} from './GamesPage'

type SubTab = 'evening' | 'penalties' | 'games'

export function EveningHubPage() {
    const t = useT()
    const [subTab, setSubTab] = useState<SubTab>('evening')

    const TABS: {id: SubTab; label: string}[] = [
        {id: 'evening', label: `🎳 ${t('nav.evening')}`},
        {id: 'penalties', label: `⚠️ ${t('nav.penalties')}`},
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
                <div style={{position: 'absolute', inset: 0, display: subTab === 'evening' ? 'block' : 'none'}}>
                    <EveningPage/>
                </div>
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
