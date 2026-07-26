export function InlineError({text}: { text: string }) {
    if (!text) return null
    return <p className="text-danger-fg text-xs">{text}</p>
}
