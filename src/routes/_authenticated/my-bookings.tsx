import { createFileRoute } from "@tanstack/react-router";

import { BookingsManager } from "@/components/BookingsManager";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/my-bookings")({
  head: () => ({
    meta: [
      { title: "My Bookings — Campus Venue Booking" },
      {
        name: "description",
        content:
          "View, edit and cancel your organization's upcoming and past venue bookings.",
      },
      { property: "og:title", content: "My Bookings — Campus Venue Booking" },
      {
        property: "og:description",
        content: "Manage your organization's venue bookings.",
      },
    ],
  }),
  component: MyBookingsPage,
});

function MyBookingsPage() {
  const { data: session } = useSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
        <p className="text-sm text-muted-foreground">
          Cancelling a booking immediately frees the venue for other organizations.
        </p>
      </div>
      <BookingsManager scope="own" organizationId={session?.organization?.id ?? null} />
    </div>
  );
}
