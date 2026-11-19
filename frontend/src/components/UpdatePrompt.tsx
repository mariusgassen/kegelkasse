import {useEffect} from 'react'
import {useT} from '@/i18n'
import {useSwUpdate} from '@/hooks/useSwUpdate'
import {markUpdateNotificationsRead} from '@/lib/releaseNotifications'
import {Island, IslandProvider, useIslandActions} from '@/lib/island'
import {useIslandContext} from '@/lib/island/context'
import {Glyph} from '@/components/islandcn/glyph'
import {DownloadGlyph} from '@/components/islandcn/glyphs'
import {ExpandedBottom, SensorRow} from '@/components/islandcn/island-layout'
import {BubbleForm, CompactText, ContextLabel, MinimalPair, TitleStack} from '@/components/islandcn/island-text'
import {IslandButton} from '@/components/islandcn/island-button'
import {islandAccent} from '@/components/islandcn/theme'

export const SW_UPDATE_ID = 'sw-update'

function SwUpdateActivity() {
    const t = useT()
    const island = useIslandActions()
    const {needRefresh, applyUpdate, dismiss} = useSwUpdate()

    useEffect(() => {
        if (!needRefresh) {
            island.end(SW_UPDATE_ID)
            return
        }
        const accent = islandAccent.blue
        const body = t('update.banner.body')
        const actionLabel = t('update.banner.button')
        const shortLabel = t('island.updateShort')
        const dismissLabel = t('update.banner.dismiss')

        island.start({
            id: SW_UPDATE_ID,
            priority: 1,
            alert: true,
            label: `${body} — ${actionLabel}`,
            onPress: () => island.expand(SW_UPDATE_ID),
            compact: {
                leading: <Glyph icon={DownloadGlyph} color={accent}/>,
                trailing: (
                    <BubbleForm bubble={null}>
                        <CompactText color={accent}>{shortLabel}</CompactText>
                    </BubbleForm>
                ),
            },
            minimal: (
                <MinimalPair
                    leading={<Glyph icon={DownloadGlyph} color={accent}/>}
                    trailing={<CompactText color={accent}>↑</CompactText>}
                />
            ),
            expanded: {
                leading: (
                    <SensorRow glyph={<Glyph icon={DownloadGlyph} color={accent} size={18}/>}>
                        <ContextLabel>{shortLabel}</ContextLabel>
                    </SensorRow>
                ),
                bottom: (
                    <ExpandedBottom reach="action" gap={12}>
                        <div role="status">
                            <TitleStack title={body} titleLines={2}/>
                        </div>
                        <div style={{display: 'flex', gap: 10}}>
                            <IslandButton
                                size="compact"
                                label={dismissLabel}
                                onPress={dismiss}
                            >
                                {dismissLabel}
                            </IslandButton>
                            <IslandButton
                                size="compact"
                                tone={{kind: 'accent', color: accent}}
                                onPress={() => {
                                    markUpdateNotificationsRead()
                                    applyUpdate().catch(() => {})
                                }}
                            >
                                {actionLabel}
                            </IslandButton>
                        </div>
                    </ExpandedBottom>
                ),
            },
        })
        return () => island.end(SW_UPDATE_ID)
    }, [island, needRefresh, applyUpdate, dismiss, t])

    return null
}

/**
 * Dynamic-Island live activity shown once a new service-worker version is waiting to activate.
 * Reloading is user-initiated (via "Aktualisieren") rather than automatic, so an installed
 * PWA never reloads unannounced mid-evening.
 */
export function UpdatePrompt() {
    const ctx = useIslandContext()
    if (ctx) return <SwUpdateActivity/>
    return (
        <IslandProvider reducedMotion="always">
            <Island label="Live"/>
            <SwUpdateActivity/>
        </IslandProvider>
    )
}
