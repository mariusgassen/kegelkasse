import {useEffect, useState} from 'react'
import {useT} from '@/i18n'
import {hasUnseen, latestVersion, type Release} from '@/lib/changelog'
import {useWhatsNewStore} from '@/store/whatsNew'
import {ALL_RELEASES, WhatsNewSheet} from './WhatsNewSheet'
import {Island, IslandProvider, useIslandActions} from '@/lib/island'
import {useIslandContext} from '@/lib/island/context'
import {Glyph} from '@/components/islandcn/glyph'
import {SparkleGlyph} from '@/components/islandcn/glyphs'
import {ExpandedBottom, SensorRow} from '@/components/islandcn/island-layout'
import {BubbleForm, CompactText, ContextLabel, MinimalPair, TitleStack} from '@/components/islandcn/island-text'
import {IslandButton} from '@/components/islandcn/island-button'

export const WHATS_NEW_ID = 'whats-new'

function WhatsNewActivity({releases = ALL_RELEASES}: {releases?: Release[]}) {
    const t = useT()
    const island = useIslandActions()
    const lastSeen = useWhatsNewStore(s => s.lastSeen)
    const markSeen = useWhatsNewStore(s => s.markSeen)
    const [open, setOpen] = useState(false)
    const latest = latestVersion(releases)
    const unseen = Boolean(latest && hasUnseen(releases, lastSeen))

    useEffect(() => {
        if (!latest || !unseen) {
            island.end(WHATS_NEW_ID)
            return
        }
        const accent = 'var(--accent)'
        const body = t('whatsNew.banner.body').replace('{v}', latest)
        const viewLabel = t('whatsNew.banner.button')
        const dismissLabel = t('whatsNew.banner.dismiss')
        const versionTag = `v${latest}`

        island.start({
            id: WHATS_NEW_ID,
            priority: 1,
            alert: true,
            label: `${body} — ${viewLabel}`,
            onPress: () => island.expand(WHATS_NEW_ID),
            compact: {
                leading: <Glyph icon={SparkleGlyph} color={accent}/>,
                trailing: (
                    <BubbleForm bubble={null}>
                        <CompactText color={accent}>{versionTag}</CompactText>
                    </BubbleForm>
                ),
            },
            minimal: (
                <MinimalPair
                    leading={<Glyph icon={SparkleGlyph} color={accent}/>}
                    trailing={<CompactText color={accent}>{versionTag}</CompactText>}
                />
            ),
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={SparkleGlyph} color={accent} size={18}/>}>
                        <ContextLabel>{versionTag}</ContextLabel>
                    </SensorRow>
                ),
                bottom: (
                    <ExpandedBottom reach="action" gap={12}>
                        <div role="status">
                            <TitleStack title={body} subtitle={t('whatsNew.title')}/>
                        </div>
                        <div style={{display: 'flex', gap: 10}}>
                            <IslandButton
                                size="compact"
                                label={dismissLabel}
                                onPress={() => markSeen(latest)}
                            >
                                {dismissLabel}
                            </IslandButton>
                            <IslandButton
                                size="compact"
                                tone={{kind: 'accent', color: accent}}
                                onPress={() => {
                                    island.collapse()
                                    setOpen(true)
                                }}
                            >
                                {viewLabel}
                            </IslandButton>
                        </div>
                    </ExpandedBottom>
                ),
            },
        })
        return () => island.end(WHATS_NEW_ID)
    }, [island, latest, unseen, markSeen, t])

    return <WhatsNewSheet open={open} onClose={() => setOpen(false)} releases={releases}/>
}

/**
 * Dynamic-Island live activity announcing a freshly published release. It disappears for good once
 * the member opens "Was ist neu" or dismisses it (both record the newest version as seen), and
 * returns only when an even newer release ships.
 */
export function WhatsNewNotice({releases = ALL_RELEASES}: {releases?: Release[]}) {
    const ctx = useIslandContext()
    if (ctx) return <WhatsNewActivity releases={releases}/>
    return (
        <IslandProvider reducedMotion="always">
            <Island label="Live"/>
            <WhatsNewActivity releases={releases}/>
        </IslandProvider>
    )
}
