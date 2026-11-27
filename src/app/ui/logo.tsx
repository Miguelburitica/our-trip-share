/**
 * The Our Share mark: a trip pin split in two shares. Same drawing as app/icon.svg, in the app's
 * navy tile; `size` in px.
 */
const PIN = "M256 418 L160 300.4 A124 124 0 1 1 352 300.4 Z";

export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" className={className}>
      {/* Same ids wherever it renders: the definitions are identical, so any copy works. */}
      <defs>
        <clipPath id="os-mark-l">
          <rect width="249" height="512" />
        </clipPath>
        <clipPath id="os-mark-r">
          <rect x="263" width="249" height="512" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="116" fill="#0E1F3A" />
      <path d={PIN} fill="#3D74E6" clipPath="url(#os-mark-l)" />
      <path d={PIN} fill="#FFFFFF" clipPath="url(#os-mark-r)" />
      <circle cx="256" cy="222" r="44" fill="#0E1F3A" />
    </svg>
  );
}

/** Mark + name, for the welcome and public pages. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[19px] font-bold tracking-tight">Our Share</span>
    </span>
  );
}
