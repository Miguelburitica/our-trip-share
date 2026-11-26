/** Tonal form primitives (docs/DESIGN.md), shared by the screens outside a trip. */
export const ui = {
  page: "mx-auto flex min-h-dvh max-w-[480px] flex-col px-5 pt-14 pb-10",
  label: "px-1 text-[15px] font-semibold",
  hint: "px-1 text-[13px] text-muted",
  input:
    "h-[54px] w-full rounded-2xl bg-tint px-4 text-[17px] text-ink placeholder:text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
  primary:
    "flex h-14 w-full items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-white transition-opacity disabled:opacity-50",
  secondary: "flex h-12 items-center justify-center rounded-full bg-tint px-5 text-[15px] font-semibold text-ink",
  link: "text-[15px] font-semibold text-accent-text",
  error: "rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-accent-text",
} as const;
