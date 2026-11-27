import { Suspense } from "react";
import { currentPrincipal } from "@/composition/auth";
import { getContainer } from "@/composition/server";
import { TripId } from "@/shared-kernel/ids";
import { OfflineSync } from "@/app/offline/offline-sync";
import { TabBar } from "@/app/ui/tab-bar";

/** Static shell: the tab bar pill renders instantly; each screen streams in behind loading.tsx. */
export default function TripLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tripId: string }> }) {
  return (
    <div className="mx-auto min-h-dvh max-w-[480px]">
      {children}
      <Suspense fallback={null}>
        <OfflineSync />
      </Suspense>
      <Suspense
        fallback={
          <div aria-hidden="true" className="fixed inset-x-0 bottom-[22px] z-20 mx-auto h-[68px] w-[calc(100%-32px)] max-w-[448px] rounded-full bg-ink" />
        }
      >
        <TripTabBar params={params} />
      </Suspense>
    </div>
  );
}

/** A Cerrado trip takes no new expenses, so the "+" goes away. The pages enforce it either way. */
async function TripTabBar({ params }: { params: Promise<{ tripId: string }> }) {
  const [{ tripId }, principal] = await Promise.all([params, currentPrincipal()]);
  const trip = principal ? await (await getContainer()).membership.getTrip(principal.id, TripId(tripId)) : null;
  return <TabBar closed={trip?.ok === true && trip.value.status === "closed"} />;
}
