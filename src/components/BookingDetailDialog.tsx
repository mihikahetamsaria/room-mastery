import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StatusBadge, PurposeBadge } from "@/components/StatusBadge";
import { formatDate, formatRange } from "@/lib/campus";
import { venueCodes, type BookingRow } from "@/lib/data";

export function BookingDetailDialog({
  booking,
  onOpenChange,
}: {
  booking: BookingRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(booking)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {booking ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">
                {booking.organizations?.abbreviation} — {booking.purpose}
              </DialogTitle>
              <DialogDescription>{booking.organizations?.name}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <dt className="col-span-1 text-muted-foreground">Date</dt>
              <dd className="col-span-2 font-medium">{formatDate(booking.date)}</dd>
              <dt className="col-span-1 text-muted-foreground">Time</dt>
              <dd className="col-span-2 font-medium">
                {formatRange(booking.start_time, booking.end_time)}
              </dd>
              <dt className="col-span-1 text-muted-foreground">Venue(s)</dt>
              <dd className="col-span-2 font-medium">{venueCodes(booking).join(", ")}</dd>
              <dt className="col-span-1 text-muted-foreground">Purpose</dt>
              <dd className="col-span-2">
                <PurposeBadge purpose={booking.purpose} />
              </dd>
              <dt className="col-span-1 text-muted-foreground">Status</dt>
              <dd className="col-span-2">
                <StatusBadge status={booking.status} />
              </dd>
              <dt className="col-span-1 text-muted-foreground">Event done</dt>
              <dd className="col-span-2 font-medium">
                {booking.event_done ? "Yes" : "Not yet"}
              </dd>
              <dt className="col-span-1 text-muted-foreground">Permission</dt>
              <dd className="col-span-2 font-medium">
                {booking.permission_signed ? "Signed & submitted" : "Pending"}
              </dd>
            </dl>

          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
