/** Kegelkasse bowling pin logo — matches the app icon */
export function AppLogo({size = 40}: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 512 512" aria-label="Kegelkasse Logo">
            <rect width="512" height="512" rx="110" fill="#3d3540"/>
            {/* Bowling pin body */}
            <ellipse cx="256" cy="330" rx="78" ry="96" fill="#e8c882"/>
            {/* Bowling pin neck */}
            <rect x="232" y="228" width="48" height="64" fill="#e8c882"/>
            {/* Bowling pin head */}
            <circle cx="256" cy="192" r="58" fill="#e8c882"/>
            {/* Red stripe on body */}
            <path d="M180,318 Q256,296 332,318" stroke="#c4701a" strokeWidth="14" fill="none" strokeLinecap="round"/>
            {/* Red stripe on head */}
            <path d="M204,192 Q256,178 308,192" stroke="#c4701a" strokeWidth="10" fill="none" strokeLinecap="round"/>
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
