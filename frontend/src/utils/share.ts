/** Share a URL via Web Share API, falling back to clipboard copy. Returns true if shared natively. */
export async function shareOrCopy(url: string, title: string): Promise<boolean> {
    if (navigator.share) {
        try {
            await navigator.share({url, title})
            return true
        } catch {
            // User cancelled or share failed — fall through to clipboard
        }
    }
    await navigator.clipboard.writeText(url)
    return false
}
