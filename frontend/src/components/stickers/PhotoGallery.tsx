/** The photos of one sticker post in the feed: a single photo as before, several as a swipeable strip numbered 1/N. */
import {ZoomableImage} from '@/components/ui/ZoomableImage.tsx'

export function PhotoGallery({urls}: { urls: string[] }) {
    if (urls.length <= 1) {
        return urls[0] ? (
            <div className="mt-2 flex justify-center">
                <ZoomableImage src={urls[0]} className="mx-auto rounded max-h-96 max-w-full object-contain border border-line/40"
                               placeholderClassName="w-full aspect-[4/3]"/>
            </div>
        ) : null
    }
    return (
        <div className="mt-2 flex gap-2 overflow-x-auto snap-x snap-mandatory" data-testid="photo-gallery">
            {urls.map((u, i) => (
                <div key={u} className="relative flex-shrink-0 w-full snap-center flex justify-center">
                    <ZoomableImage src={u} className="mx-auto rounded max-h-96 max-w-full object-contain border border-line/40"
                                   placeholderClassName="w-full aspect-[4/3]"/>
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-accent text-on-accent text-xs font-bold">
                        {i + 1}/{urls.length}
                    </span>
                </div>
            ))}
        </div>
    )
}
