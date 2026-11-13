/** Empty state. With an `icon`: centred block with a large glyph. Without: a one-line inline note for use inside a card. */
export function Empty({icon, text}: { icon?: string; text: string }) {
    if (!icon) return <p className="text-center py-4 text-sm text-muted">{text}</p>
    return (
        <div className="text-center py-8 text-muted">
            <div className="text-4xl mb-2 opacity-40">{icon}</div>
            <p className="text-xs">{text}</p>
        </div>
    )
}
