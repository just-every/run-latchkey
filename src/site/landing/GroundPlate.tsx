// Clean material crop from picked page-02: [1160, 0, 1536, 740]. It contains
// no letters, marks or leaders. All visible page content remains HTML/CSS.
const sizes = [480, 960, 1536, 2304, 3072]
const sources = (format: string) => sizes.map(width => `/site/ground/tangerine-${width}.${format} ${width}w`).join(', ')

export function GroundPlate({ eager = false }: { eager?: boolean }) {
  return (
    <picture className="ground-plate" aria-hidden="true">
      <source type="image/avif" srcSet={sources('avif')} sizes="100vw" />
      <img src="/site/ground/tangerine-1536.webp" srcSet={sources('webp')} sizes="100vw" alt="" width={1536} height={1024} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </picture>
  )
}
