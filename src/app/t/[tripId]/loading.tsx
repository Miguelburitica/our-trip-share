/** Skeleton in the Tonal style while a trip screen streams in. */
export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Cargando" className="flex animate-pulse flex-col gap-8 px-5 pt-14 pb-36">
      <div className="flex flex-col gap-2 px-1">
        <div className="h-6 w-40 rounded-full bg-tint" />
        <div className="h-4 w-24 rounded-full bg-tint" />
      </div>
      <div className="h-[196px] rounded-[28px] bg-tint" />
      <div className="h-[72px] rounded-[22px] bg-surface shadow-card" />
      <div className="h-[132px] rounded-[22px] bg-surface shadow-card" />
    </main>
  );
}
