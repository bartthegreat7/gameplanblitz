/**
 * Stadium photograph behind the dashboard, as its own fixed layer (no text or UI in the image).
 * A themed gradient keeps the photo visible behind the greeting and along the bottom edge while the
 * middle of the screen, where the numbers are, stays dark and clean. Photo: Scott Greer on Unsplash
 * (Unsplash License), see public/images/CREDITS.md.
 */
export function DashboardBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -inset-4 bg-cover bg-[position:70%_18%] opacity-95 blur-[1px] md:bg-[position:65%_22%]"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/stadium-background.webp)`,
        }}
      />
      {/* lighter at the top (behind the greeting), darkest through the middle, a little relief at the bottom */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--bg) 8%, transparent) 0%, color-mix(in srgb, var(--bg) 35%, transparent) 20%, color-mix(in srgb, var(--bg) 72%, transparent) 38%, color-mix(in srgb, var(--bg) 84%, transparent) 62%, color-mix(in srgb, var(--bg) 62%, transparent) 100%)',
        }}
      />
      {/* side vignette so the photo never competes with the sidebar edge */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 60% 20%, transparent 45%, color-mix(in srgb, var(--bg) 55%, transparent) 100%)',
        }}
      />
    </div>
  )
}
