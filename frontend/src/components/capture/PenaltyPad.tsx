import {Plus} from 'lucide-react'
import {PenaltyPickButton} from '@/components/evening/PenaltyPickButton'
import {useT} from '@/i18n'
import type {PenaltyType} from '@/types.ts'

interface PenaltyPadProps {
    /** Penalty types grouped by price, cheapest first. */
    groups: Array<[number, PenaltyType[]]>
    /** How often each type has been tapped for the current selection or tray. */
    counts: Map<number, number>
    onTap: (penaltyTypeId: number) => void
    money: (amount: number) => string
    /** `tablet` labels each price row; `phone` is one dense grid with the price on every button. */
    layout: 'tablet' | 'phone'
    /** Adds a button for a penalty that is not on the list, or for an amount in euros. */
    onCustom?: () => void
}

/** All penalty types as big buttons. Every tap counts; holding one plays its call-out. */
export function PenaltyPad({groups, counts, onTap, money, layout, onCustom}: PenaltyPadProps) {
    const t = useT()
    const phone = layout === 'phone'

    const button = (type: PenaltyType) => {
        const count = counts.get(type.id) ?? 0
        return (
            <PenaltyPickButton key={type.id} type={type} onSelect={() => onTap(type.id)}
                               className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-surface-2 px-1 py-1.5 transition-transform active:scale-[.97] ${phone ? 'min-h-[66px]' : 'min-h-[72px]'} ${count ? 'border-accent' : 'border-transparent'}`}>
                <span aria-hidden="true" className="text-xl leading-none">{type.icon}</span>
                <span className={`max-w-full truncate font-bold ${phone ? 'text-xs' : 'text-sm'}`}>{type.name}</span>
                {phone && <span className="text-xs text-muted leading-tight">{money(type.default_amount)}</span>}
                {count > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1 text-xs font-extrabold text-on-accent">
                        ×{count}
                    </span>
                )}
            </PenaltyPickButton>
        )
    }

    const custom = onCustom && (
        <button type="button" onClick={onCustom}
                className="flex min-h-[66px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-line px-1 text-muted transition-transform active:scale-[.97]">
            <Plus size={20} strokeWidth={2} aria-hidden="true"/>
            <span className="max-w-full text-center text-xs font-bold leading-tight">{t('capture.custom')}</span>
        </button>
    )

    if (phone) {
        return (
            <div className="grid grid-cols-3 gap-1.5">
                {groups.flatMap(([, types]) => types).map(button)}
                {custom}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2.5">
            {groups.map(([amount, types]) => (
                <div key={amount} role="group" aria-label={money(amount)}
                     className="grid grid-cols-1 gap-1.5 sm:grid-cols-[3.5rem_minmax(0,1fr)]">
                    <div className="text-sm font-bold text-muted sm:pt-6" aria-hidden="true">{money(amount)}</div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">{types.map(button)}</div>
                </div>
            ))}
            {custom}
        </div>
    )
}
