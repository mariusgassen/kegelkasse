/** The photos of one sticker post in the feed: square crops (full photo in the viewer); several as a swipeable strip numbered 1/N on the image. */
import {ZoomableImage} from '@/components/ui/ZoomableImage.tsx'

export function PhotoGallery({urls, title, subtitle, shareUrl}: { urls: string[]; title?: string; subtitle?: string; shareUrl?: string }) {
    if (urls.length === 0) return null
    const many = urls.length > 1
    return (
        <div className={`mt-2 flex gap-2 ${many ? 'overflow-x-auto snap-x snap-mandatory' : ''}`}
             data-testid={many ? 'photo-gallery' : undefined}>
            {urls.map((u, i) => (
                <div key={u} className="relative flex-shrink-0 w-full snap-center">
                    <ZoomableImage src={u} title={title} subtitle={subtitle} shareUrl={shareUrl}
                                   gallery={many ? urls : undefined} index={i}
                                   buttonClassName="w-full"
                                   className="w-full aspect-square object-cover rounded border border-line/40"
                                   placeholderClassName="w-full aspect-square"/>
                    {many && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-accent text-on-accent text-xs font-bold pointer-events-none">
                            {i + 1}/{urls.length}
                        </span>
                    )}
                </div>
            ))}
        </div>
    )
}
