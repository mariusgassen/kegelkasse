/** Kegelkasse squirrel logo — SVG faithful to the real logo's color split */
export function AppLogo({size = 40}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Kegelkasse Logo">
            <circle cx="50" cy="50" r="48" fill="#3d3540"/>
            <path d="M2 50 A48 48 0 0 1 98 50 Z" fill="#6b7c5a"/>
            <path d="M2 50 A48 48 0 0 0 98 50 Z" fill="#4a3c38"/>
            <circle cx="50" cy="50" r="47" fill="none" stroke="#5a4d57" strokeWidth="1.5"/>
            {/* Squirrel body */}
            <ellipse cx="38" cy="52" rx="11" ry="14" fill="#b8401a"/>
            <circle cx="38" cy="36" r="9" fill="#b8401a"/>
            <ellipse cx="33" cy="28" rx="3" ry="5" fill="#b8401a"/>
            <ellipse cx="43" cy="28" rx="3" ry="5" fill="#b8401a"/>
            {/* Tail */}
            <path d="M49 54 Q70 40 67 61 Q63 77 49 69 Z" fill="#c4501e"/>
            {/* Bowling setup */}
            <ellipse cx="70" cy="57" rx="5" ry="7" fill="#f5ede0"/>
            <ellipse cx="70" cy="50" rx="3" ry="3" fill="#f5ede0"/>
            <circle cx="62" cy="61" r="5.5" fill="#e8a020"/>
        </svg>
    )
}

export function AppLogoAnimated({size = 32}: { size?: number }) {
    return (
        <div style={{animation: 'bob 3s ease-in-out infinite', display: 'inline-flex'}}>
            <AppLogo size={size}/>
        </div>
    )
}
