/**
 * Component-book inventory (snapshot 2026-11-13).
 *
 * Hand-curated findings behind the first page of the book (`/book`). The counts come from
 * `npm run book:audit` (scripts/book-audit.mjs) — re-run it and update this file when a migration
 * lands, so the book keeps answering "how much of the app still does X by hand?".
 *
 * Counts are occurrences over non-test `.tsx` under `src/` (what the script prints).
 */

export type Status = 'component' | 'css-class' | 'pattern'

export interface Primitive {
    name: string
    /** Where it lives. */
    source: string
    status: Status
    /** What it is for, one line. */
    use: string
    /** Usage count (references in non-test .tsx). */
    uses: string
}

/** What already exists as a shared building block. */
export const PRIMITIVES: Primitive[] = [
    {name: '<Button>', source: 'ui/Button.tsx', status: 'component', use: 'The one button: variant primary|secondary|danger, size md|sm|xs, block. Wraps the btn-* classes.', uses: '259 in 36 files'},
    {name: 'btn-ghost', source: 'index.css', status: 'css-class', use: 'Defined, never used (dead).', uses: '0'},
    {name: 'kce-card', source: 'index.css', status: 'css-class', use: 'Card surface (16px radius, 1px line).', uses: '163'},
    {name: 'kce-input', source: 'index.css', status: 'css-class', use: 'Text input, select and textarea.', uses: '161'},
    {name: 'field-label', source: 'index.css', status: 'css-class', use: 'Uppercase form label.', uses: '184'},
    {name: 'sec-heading', source: 'index.css', status: 'css-class', use: 'Section heading with trailing rule.', uses: '53'},
    {name: 'chip / chip.active', source: 'index.css', status: 'css-class', use: 'Filter / multi-select pill.', uses: '10'},
    {name: '<Sheet>', source: 'ui/Sheet.tsx', status: 'component', use: 'Every bottom sheet (focus, Escape, drag, close).', uses: '87 in 28 files'},
    {name: '<ActionSheet> family', source: 'ui/ActionSheet.tsx', status: 'component', use: '⋮ menus (CardActionMenu, ActionItem, MoreButton).', uses: 'see source'},
    {name: '<ExpandableCard>', source: 'ui/ExpandableCard.tsx', status: 'component', use: 'Disclosure card.', uses: '38 in 8 files'},
    {name: '<MemberRow> + Avatar + MemberBadges', source: 'ui/MemberRow.tsx …', status: 'component', use: 'Any member / player / account list entry.', uses: '8 / 33 / –'},
    {name: '<StatTile>', source: 'ui/StatTile.tsx', status: 'component', use: 'One number plus its caption.', uses: '36 in 4 files'},
    {name: '<Tabs>', source: 'ui/Tabs.tsx', status: 'component', use: 'Scrolling pill tab strip for pages and sheets.', uses: '5 in 5 files'},
    {name: '<ConfirmSheet>', source: 'ui/ConfirmSheet.tsx', status: 'component', use: 'Confirm-before-delete sheet: message + one red button.', uses: '6 in 4 files'},
    {name: '<Switch>', source: 'ui/Switch.tsx', status: 'component', use: 'On/off setting row (label + hint). Token colours.', uses: '5 in 3 files'},
    {name: '<ModeToggle>', source: 'ui/ModeToggle.tsx', status: 'component', use: 'Segmented 2–3 way switch inside a panel.', uses: '14 in 5 files'},
    {name: '<ChipSelect>', source: 'ui/ChipSelect.tsx', status: 'component', use: 'Multi-select chips with all / none.', uses: '8 in 3 files'},
    {name: '<SearchInput>', source: 'ui/SearchInput.tsx', status: 'component', use: 'Text filter with clear button.', uses: '7 in 3 files'},
    {name: '<Empty>', source: 'ui/Empty.tsx', status: 'component', use: 'Empty-state icon + text.', uses: '58 in 24 files'},
    {name: '<Skeleton*>', source: 'ui/Skeleton.tsx', status: 'component', use: 'Loading placeholders.', uses: '58 in 14 files'},
    {name: '<Loading>', source: 'ui/Loading.tsx', status: 'component', use: 'Text-only loader. No importers left (dead).', uses: '0'},
    {name: 'showToast / <ToastContainer>', source: 'ui/Toast.tsx', status: 'component', use: 'Feedback after mutations.', uses: 'everywhere'},
    {name: '<CountUp>, <ZoomableImage>, <EmojiPickerButton>, <SoundPickerButton>, <MediaUploadButton>, <ReactionPill>, <ItemReactionBar>, <CommentThread>, <Markdown>', source: 'ui/*', status: 'component', use: 'Specialised widgets.', uses: 'feature-specific'},
]

export interface Duplicate {
    id: string
    title: string
    /** What the duplication looks like. */
    finding: string
    /** Counts, human-readable. */
    count: string
    /** Where to look. */
    where: string
    /** The component that would replace it. */
    proposal: string
    /** 1 = do first. */
    priority: 1 | 2 | 3
}

/** Patterns the app repeats by hand. */
export const DUPLICATES: Duplicate[] = [
    {
        id: 'confirm',
        title: 'Confirm-before-destructive sheets',
        finding: '<ConfirmSheet> now covers the plain message + red button sheets (6 sites). The remaining ones carry extra fields (reason inputs, payout, cancel button) and still build their own <Sheet>.',
        count: '21 danger buttons in 10 files (most are confirm sheets with extra fields)',
        where: 'EveningPage, ProtocolPage, GamesPage, CommitteePage, TreasuryPage, MembersPage, SchedulePage, ClubAdminPage …',
        proposal: '<ConfirmSheet open title message confirmLabel danger busy onConfirm onClose>',
        priority: 1,
    },
    {
        id: 'buttons',
        title: 'Buttons',
        finding: '<Button> now wraps the btn-* classes (259 call sites migrated). Still open: btn-danger is smaller than btn-primary and has no disabled style, btn-ghost is dead, and ~140 <button> elements (icon buttons, rows, ad-hoc pills) carry no shared class.',
        count: '~140 <button> outside Button/chip',
        where: 'everywhere',
        proposal: '<Button variant="primary|secondary|danger|ghost" size="md|sm|xs" block busy leadingIcon> keeping the CSS classes underneath so nothing moves visually',
        priority: 2,
    },
    {
        id: 'empty',
        title: 'Empty states',
        finding: '<Empty> now covers both the icon block and a one-line inline note (no icon). The earlier "66 hand-rolled" count was mostly false positives (the € prefix span, captions, hints); about 12 real empty states were migrated. Left: two kce-card empties (PenaltyTimeline, EventTicker) and TreasuryAudit, which carry their own card/test-id.',
        count: '58 <Empty> uses',
        where: 'MembersPage, TreasuryPage, SchedulePage, StatsPage, CommitteePage …',
        proposal: 'Adopt <Empty>; add size="inline" for in-card use',
        priority: 2,
    },
    {
        id: 'colours',
        title: 'Colour literals outside the token system',
        finding: 'Tailwind palette classes (amber/orange/yellow/red) and rgba(255,255,255,.07) button fills are replaced by tokens (accent-tint, danger-fg, bg-surface-2), and colourLiterals.test.ts now fails on any new palette class. The remaining hex/rgba values are the overlays on photos and maps (ZoomableImage, StickerMap), chart stroke halos and the dark-only kiosk views.',
        count: 'hex: 74 left in 5 files (kiosk/book exempt, rest overlays); rgba: 46 in 11 files (photo/map overlays); palette: none outside exempt files',
        where: 'ZoomableImage, StickerMap, StatsPage chart strokes, OfflineBanner/UpdatePrompt/InstallPrompt close discs',
        proposal: 'Leave the overlays; consider a --scrim token if more appear',
        priority: 2,
    },
    {
        id: 'inline-style',
        title: 'Inline style for theme colours',
        finding: 'style={{background: …, color: …}} is used to apply tokens that classes already express, which hides them from the Tailwind purge, the search and the migration greps.',
        count: '261 occurrences in 33 files',
        where: '33 files incl. StatsPage, CorrelationSection, TreasuryPage, BalanceHistoryChart, ClubAdminPage, RootLayout, SearchInput',
        proposal: 'Class-based tokens by default; inline style only for computed values (chart geometry, per-team colour)',
        priority: 3,
    },
    {
        id: 'labels',
        title: 'Hand-rolled field labels',
        finding: 'field-label (184 uses) is the standard, but 42 places repeat "text-xs font-bold text-muted uppercase tracking-wider" without the mb-1.5 / display:block that field-label brings.',
        count: '44 hits in 16 files',
        where: 'AiAskPanel, HeadToHead, StatsLab, TreasuryPage, StatsPage, MembersPage, ProtocolPage, ProfileSheet …',
        proposal: '<Field label hint error> wrapping label + control + error line; use field-label for the label',
        priority: 3,
    },
    {
        id: 'progress',
        title: 'Progress / share bars',
        finding: 'PaidShareBar, wrapped progress segments, achievement progress and the accounts chart each draw a rounded track + fill by hand.',
        count: '9 hits in 7 files',
        where: 'TreasuryPage, WrappedDeck, StatsPage, CorrelationSection, SeasonComparison, ProfileSheet, RootLayout',
        proposal: '<ProgressBar value max tone segments?>',
        priority: 3,
    },
    {
        id: 'badges',
        title: 'Badges / tinted pills',
        finding: 'MemberBadges covers Ich / king / president / pins, but status pills (tier, "Neu", Aktiv, role) are written as bg-accent-tint / bg-danger-tint / bg-positive-tint spans each time.',
        count: '9 tint pills in 6 files',
        where: 'ClubAdminPage, ProfileSheet, TreasuryAudit, BookingReviewCard, AiAskPanel, WhatsNewSheet',
        proposal: '<Badge tone="accent|positive|danger|muted">',
        priority: 3,
    },
    {
        id: 'avatar-like',
        title: 'Round gradient initials outside <Avatar>',
        finding: 'Several places draw their own rounded-full flex-centred disc with a letter (leaderboards, comment composer, sticker authors).',
        count: '25 hits in 17 files (regex is broad: includes close buttons and icon discs, not only avatars)',
        where: 'CommentThread, ProfileSheet, StatsPage, TreasuryPage, EveningPage, NotificationPanel …',
        proposal: 'Use <Avatar size>; audit each hit by hand first',
        priority: 3,
    },
]

export interface Distribution {
    label: string
    rows: { name: string; count: number }[]
}

/** Raw usage distributions, for spotting scales that drift. */
export const DISTRIBUTIONS: Distribution[] = [
    {
        label: 'Border radius',
        rows: [
            {name: 'rounded-full', count: 104},
            {name: 'rounded-lg', count: 83},
            {name: 'rounded (4px)', count: 56},
            {name: 'rounded-xl', count: 21},
            {name: 'rounded-md', count: 6},
            {name: 'rounded-2xl', count: 1},
            {name: 'rounded-sm', count: 1},
        ],
    },
    {
        label: 'Text size',
        rows: [
            {name: 'text-xs (12px)', count: 656},
            {name: 'text-sm (14px)', count: 362},
            {name: 'text-base', count: 29},
            {name: 'text-xl', count: 21},
            {name: 'text-2xl', count: 19},
            {name: 'text-lg', count: 16},
            {name: 'text-3xl / 4xl', count: 9},
        ],
    },
]

export interface Next {
    step: string
    why: string
}

/** Proposed migration order (see PR description). */
export const NEXT_STEPS: Next[] = [
        {step: '1. Migrate confirm sheets with extra fields', why: 'ModeToggle stays separate from <Tabs> on purpose: it is a segmented control inside a panel, Tabs is a scrolling page-section strip.'},
]
