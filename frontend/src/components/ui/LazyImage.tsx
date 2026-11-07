import {useEffect, useRef, useState, type CSSProperties} from 'react'
import {isMediaUrl, thumbUrl} from '@/lib/mediaUrl.ts'

interface Props {
    src: string
    alt?: string
    /** Classes of the image itself (sizing, rounding, object-fit). */
    className?: string
    style?: CSSProperties
    /** Width of the size variant to request; ignored for URLs the server cannot resize. */
    width?: number
    /** Classes of the box that holds the placeholder until the photo has arrived. */
    placeholderClassName?: string
    eager?: boolean
    /** Rendered width hint for `srcSet`; the default fits a full-width card. */
    sizes?: string
}

/**
 * A content photo that never pops in out of nothing: a shimmering box with a tiny blurred copy of
 * the photo stands in until the real image has loaded, then the photo fades in. The image is a
 * size variant (`?w=`), not the full upload. Non-uploaded URLs render as a plain lazy `<img>`.
 */
export function LazyImage({src, alt = '', className, style, width = 960, placeholderClassName = 'min-h-40', eager, sizes = '(min-width: 640px) 600px, 100vw'}: Props) {
    const [loaded, setLoaded] = useState(false)
    const ref = useRef<HTMLImageElement>(null)
    const resizable = isMediaUrl(src)
    // Let the browser pick 480 px or 960 px for the screen instead of always fetching `width`.
    const srcSet = resizable && !eager && width > 480
        ? `${thumbUrl(src, 480)} 480w, ${thumbUrl(src, width)} ${width}w`
        : undefined

    useEffect(() => {
        setLoaded(false)
        // A cached photo can be complete before React attaches onLoad.
        if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true)
    }, [src])

    if (!resizable) {
        return <img src={src} alt={alt} className={className} style={style} loading={eager ? undefined : 'lazy'} decoding="async"/>
    }

    return (
        <span className={`relative block max-w-full ${loaded ? '' : `kce-skeleton overflow-hidden ${placeholderClassName}`}`}
              data-testid="lazy-image" data-loaded={loaded}>
            <img
                ref={ref}
                src={thumbUrl(src, width)}
                srcSet={srcSet}
                sizes={srcSet ? sizes : undefined}
                alt={alt}
                loading={eager ? undefined : 'lazy'}
                decoding="async"
                onLoad={() => setLoaded(true)}
                onError={() => setLoaded(true)}
                className={className}
                style={{...style, opacity: loaded ? 1 : 0, transition: 'opacity var(--motion-base) var(--ease-standard)'}}
            />
            {!loaded && (
                <img
                    src={thumbUrl(src, 240)}
                    alt=""
                    aria-hidden="true"
                    loading={eager ? undefined : 'lazy'}
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{filter: 'blur(14px)', transform: 'scale(1.15)'}}
                />
            )}
        </span>
    )
}
