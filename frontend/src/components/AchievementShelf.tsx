import {useState} from 'react'
import {useT} from '@/i18n'
import type {Achievement, AchievementTier} from '@/types'
import {earnedCount, progressFraction, sortAchievements} from '@/lib/achievements'

const TIER_COLOR: Record<AchievementTier, string> = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: 'var(--kce-primary)',
}

function tierLabelKey(tier: AchievementTier): string {
    return `achievement.tier.${tier}`
}

function BadgeCell({a, selected, onSelect}: {
    a: Achievement
    selected: boolean
    onSelect: () => void
}) {
    const t = useT()
    const title = t(`achievement.${a.key}.title` as never)
    const ringColor = a.earned && a.tier ? TIER_COLOR[a.tier] : 'var(--kce-border)'
    const frac = progressFraction(a)
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            aria-label={title}
            className="flex flex-col items-center text-center gap-1 rounded-lg p-1 transition-colors active:opacity-70"
            style={{background: selected ? 'var(--kce-surface2)' : 'transparent'}}
        >
            <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 transition-all"
                style={{
                    borderColor: ringColor,
                    background: a.earned ? 'var(--kce-surface2)' : 'transparent',
                    filter: a.earned ? 'none' : 'grayscale(1)',
                    opacity: a.earned ? 1 : 0.45,
                    boxShadow: selected ? `0 0 0 2px ${ringColor}` : 'none',
                }}
            >
                {a.icon}
            </div>
            <div className="text-[9px] leading-tight text-kce-cream font-semibold max-w-[64px]">{title}</div>
            {a.earned && a.tier && (
                <div
                    className="text-[8px] font-bold uppercase tracking-wider"
                    style={{color: TIER_COLOR[a.tier]}}
                >
                    {t(tierLabelKey(a.tier) as never)}
                </div>
            )}
            {!a.earned && a.target !== null && (
                <div className="w-[52px]">
                    <div className="h-1 rounded-full bg-kce-border overflow-hidden">
                        <div className="h-full rounded-full bg-kce-primary" style={{width: `${frac * 100}%`}}/>
                    </div>
                    <div className="text-[8px] text-kce-muted mt-0.5">
                        {Math.round(a.progress)}/{a.target}
                    </div>
                </div>
            )}
        </button>
    )
}

function BadgeDetail({a}: { a: Achievement }) {
    const t = useT()
    const title = t(`achievement.${a.key}.title` as never)
    const desc = t(`achievement.${a.key}.desc` as never)
    const ringColor = a.earned && a.tier ? TIER_COLOR[a.tier] : 'var(--kce-border)'
    const frac = progressFraction(a)
    return (
        <div className="mt-3 rounded-lg p-3 bg-kce-surface2 border border-kce-border">
            <div className="flex items-center gap-3">
                <div
                    className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-2xl border-2"
                    style={{
                        borderColor: ringColor,
                        filter: a.earned ? 'none' : 'grayscale(1)',
                        opacity: a.earned ? 1 : 0.5,
                    }}
                >
                    {a.icon}
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-bold text-kce-cream">{title}</div>
                    <div className="text-[11px] text-kce-muted leading-snug">{desc}</div>
                </div>
            </div>

            {/* Status line: unlocked tier, or how far to the next threshold. */}
            {a.earned ? (
                <div className="mt-2 text-[11px] font-semibold flex items-center gap-1 flex-wrap">
                    <span className="text-green-400">✓ {t('achievement.status.earned')}</span>
                    {a.tier && (
                        <span style={{color: TIER_COLOR[a.tier]}}>· {t(tierLabelKey(a.tier) as never)}</span>
                    )}
                    {a.target !== null && (
                        <span className="text-kce-muted">
                            · {t('achievement.status.nextTier')} {a.target}
                        </span>
                    )}
                </div>
            ) : (
                <div className="mt-2">
                    <div className="text-[11px] font-semibold text-kce-muted mb-1">
                        {t('achievement.status.locked')}
                    </div>
                    {a.target !== null && (
                        <>
                            <div className="h-1.5 rounded-full bg-kce-border overflow-hidden">
                                <div className="h-full rounded-full bg-kce-primary" style={{width: `${frac * 100}%`}}/>
                            </div>
                            <div className="text-[10px] text-kce-muted mt-1">
                                {Math.round(a.progress)} / {a.target}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export function AchievementShelf({achievements}: { achievements: Achievement[] }) {
    const t = useT()
    const sorted = sortAchievements(achievements)
    const earned = earnedCount(achievements)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const selected = sorted.find(a => a.key === selectedKey) ?? null
    return (
        <div className="kce-card p-4">
            <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-kce-muted uppercase tracking-wider">
                    {t('achievement.title')}
                </div>
                <div className="text-[11px] font-bold text-kce-primary">
                    {earned}/{achievements.length}
                </div>
            </div>
            <div className="text-[10px] text-kce-muted mb-3">{t('achievement.tapHint')}</div>
            <div className="grid grid-cols-4 gap-y-3 gap-x-1">
                {sorted.map(a => (
                    <BadgeCell
                        key={a.key}
                        a={a}
                        selected={a.key === selectedKey}
                        onSelect={() => setSelectedKey(k => (k === a.key ? null : a.key))}
                    />
                ))}
            </div>
            {selected && <BadgeDetail a={selected}/>}
        </div>
    )
}
