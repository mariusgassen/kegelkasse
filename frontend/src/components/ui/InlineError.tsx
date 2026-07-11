export function InlineError({text}: { text: string }) {
    if (!text) return null
    return <p className="text-red-400 text-xs">{text}</p>
}
