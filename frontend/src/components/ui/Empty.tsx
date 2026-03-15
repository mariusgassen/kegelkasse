export function Empty({icon, text}: { icon: string; text: string }) {
    return (
        <div className="text-center py-8 text-kce-muted">
            <div className="text-4xl mb-2 opacity-40">{icon}</div>
            <p className="text-xs">{text}</p>
        </div>
    )
}
