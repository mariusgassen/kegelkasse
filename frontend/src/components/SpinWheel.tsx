import {useRef, useState} from 'react'
import {useT} from '../i18n'
import type {PenaltyType} from '../types'

interface SpinWheelProps {
    penaltyTypes: PenaltyType[]
    onResult: (pt: PenaltyType) => void
}

export function SpinWheel({penaltyTypes, onResult}: SpinWheelProps) {
    const [spinning, setSpinning] = useState(false)
    const [result, setResult] = useState<PenaltyType | null>(null)
    const wheelRef = useRef<HTMLDivElement>(null)
    const t = useT()

    if (!penaltyTypes.length) return null

    const spin = () => {
        if (spinning) return
        setResult(null)
        setSpinning(true)

        const winner = penaltyTypes[Math.floor(Math.random() * penaltyTypes.length)]
        const sliceAngle = 360 / penaltyTypes.length
        const winnerIndex = penaltyTypes.indexOf(winner)
        const targetDeg = 360 * 5 + (360 - winnerIndex * sliceAngle - sliceAngle / 2)

        if (wheelRef.current) {
            wheelRef.current.style.setProperty('--target', `${targetDeg}deg`)
            wheelRef.current.style.transform = ''
            void wheelRef.current.offsetHeight // force reflow
            wheelRef.current.classList.add('wheel-spinning')
        }

        setTimeout(() => {
            setSpinning(false)
            setResult(winner)
            onResult(winner)
        }, 3200)
    }

    const sliceCount = penaltyTypes.length
    const segmentAngle = 360 / sliceCount
    const colors = ['#c4701a', '#6b7c5a', '#4a3c6a', '#3c5a4a', '#7c4a2a', '#4a5c7c']

    return (
        <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative" style={{width: 200, height: 200}}>
                {/* Pointer */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10"
                     style={{
                         width: 0, height: 0, borderLeft: '8px solid transparent',
                         borderRight: '8px solid transparent', borderTop: '20px solid #e8a020'
                     }}/>
                {/* Wheel */}
                <div ref={wheelRef} style={{
                    width: 200, height: 200, borderRadius: '50%', overflow: 'hidden',
                    border: '3px solid #3d2e28', position: 'relative'
                }}>
                    <svg viewBox="0 0 200 200" width="200" height="200">
                        {penaltyTypes.map((pt, i) => {
                            const startAngle = (i * segmentAngle - 90) * (Math.PI / 180)
                            const endAngle = ((i + 1) * segmentAngle - 90) * (Math.PI / 180)
                            const x1 = 100 + 100 * Math.cos(startAngle)
                            const y1 = 100 + 100 * Math.sin(startAngle)
                            const x2 = 100 + 100 * Math.cos(endAngle)
                            const y2 = 100 + 100 * Math.sin(endAngle)
                            const midAngle = ((i + 0.5) * segmentAngle - 90) * (Math.PI / 180)
                            const tx = 100 + 65 * Math.cos(midAngle)
                            const ty = 100 + 65 * Math.sin(midAngle)
                            return (
                                <g key={pt.id}>
                                    <path d={`M 100 100 L ${x1} ${y1} A 100 100 0 0 1 ${x2} ${y2} Z`}
                                          fill={colors[i % colors.length]} stroke="#1a1410" strokeWidth="1"/>
                                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                                          fontSize="18" fill="rgba(255,255,255,.9)">{pt.icon}</text>
                                </g>
                            )
                        })}
                    </svg>
                </div>
            </div>

            <button className="btn-primary px-8" onClick={spin} disabled={spinning}>
                {spinning ? '🌀' : t('wheel.spin')}
            </button>

            {result && !spinning && (
                <div className="text-center animate-fade-in">
                    <div className="text-2xl mb-1">{result.icon}</div>
                    <div className="font-bold text-kce-amber">{result.name}</div>
                    <div className="text-kce-muted text-xs">{result.default_amount.toFixed(2)} €</div>
                </div>
            )}
        </div>
    )
}
