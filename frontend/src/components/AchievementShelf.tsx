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

function BadgeCell({a}: { a: Achievement }) {
    const t = useT()
    const title = t(`achievement.${a.key}.title` as never)
    const ringColor = a.earned && a.tier ? TIER_COLOR[a.tier] : 'var(--kce-border)'
    const frac = progressFraction(a)
    return (
        <div
            className="flex flex-col items-center text-center gap-1"
            title={t(`achievement.${a.key}.desc` as never)}
        >
            <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 transition-all"
                style={{
                    borderColor: ringColor,
                    background: a.earned ? 'var(--kce-surface2)' : 'transparent',
                    filter: a.earned ? 'none' : 'grayscale(1)',
                    opacity: a.earned ? 1 : 0.45,
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
        </div>
    )
}

export function AchievementShelf({achievements}: { achievements: Achievement[] }) {
    const t = useT()
    const sorted = sortAchievements(achievements)
    const earned = earnedCount(achievements)
    return (
        <div className="kce-card p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-kce-muted uppercase tracking-wider">
                    {t('achievement.title')}
                </div>
                <div className="text-[11px] font-bold text-kce-primary">
                    {earned}/{achievements.length}
                </div>
            </div>
            <div className="grid grid-cols-4 gap-y-3 gap-x-1">
                {sorted.map(a => <BadgeCell key={a.key} a={a}/>)}
            </div>
        </div>
    )
}
