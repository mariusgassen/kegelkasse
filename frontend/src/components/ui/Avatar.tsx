type AvatarSize = 'sm' | 'md' | 'lg'

const SIZES: Record<AvatarSize, { box: string; text: string }> = {
    sm: {box: 'w-8 h-8', text: 'text-sm'},
    md: {box: 'w-9 h-9', text: 'text-sm'},
    lg: {box: 'w-14 h-14', text: 'text-lg font-display'},
}

interface AvatarProps {
    /** Display name — its first letter is the fallback when no image is set. */
    name: string
    src?: string | null
    size?: AvatarSize
    /** `muted` marks non-members (guests) with a flat grey disc instead of the club gradient. */
    variant?: 'default' | 'muted'
    className?: string
}

/**
 * Round member avatar: uploaded image, or the first letter of the display name
 * on the club's primary-colour gradient.
 */
export function Avatar({name, src, size = 'md', variant = 'default', className = ''}: AvatarProps) {
    const {box, text} = SIZES[size]
    const muted = variant === 'muted'
    return (
        <div
            className={`${box} ${text} rounded-full flex items-center justify-center font-bold flex-shrink-0 overflow-hidden ${muted ? 'bg-muted text-on-muted' : 'text-on-accent'} ${className}`}
            style={muted ? undefined : {background: 'linear-gradient(135deg,var(--accent-shade),var(--accent))'}}>
            {src
                ? <img src={src} alt="" className="w-full h-full object-cover"/>
                : (name[0] ?? '?').toUpperCase()}
        </div>
    )
}
