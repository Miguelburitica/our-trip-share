import { Suspense } from "react";
import { TabBar } from "@/app/ui/tab-bar";

/** Static shell: the tab bar pill renders instantly; each screen streams in behind loading.tsx. */
export default function TripLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-[480px]">
      {children}
      <Suspense
        fallback={
          <div aria-hidden="true" className="fixed inset-x-0 bottom-[22px] z-20 mx-auto h-[68px] w-[calc(100%-32px)] max-w-[448px] rounded-full bg-ink" />
        }
      >
        <TabBar />
      </Suspense>
    </div>
  );
}
