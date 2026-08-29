import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatRange, type Purpose } from "@/lib/campus";

export type ConfirmedBooking = {
  reference: string;
  purpose: Purpose;
  date: string;
  endDate?: string;
  days?: number;
  start: string;
  end: string;
  venues: string;
  updated: boolean;
};

export function BookingConfirmation({
  booking,
  onClose,
}: {
  booking: ConfirmedBooking | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(booking)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {booking ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="size-5 text-primary" />
                {booking.updated ? "Booking updated" : "Booking confirmed"}
              </DialogTitle>
              <DialogDescription>
                The venue is now reserved for your organization. No other club or
                society can book it for this slot.
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
              <dt className="text-muted-foreground">Reference</dt>
              <dd className="col-span-2 font-mono font-medium">#{booking.reference}</dd>
              <dt className="text-muted-foreground">Venue(s)</dt>
              <dd className="col-span-2 font-medium">{booking.venues}</dd>
              <dt className="text-muted-foreground">
                {booking.endDate && booking.endDate > booking.date ? "Dates" : "Date"}
              </dt>
              <dd className="col-span-2 font-medium">
                {booking.endDate && booking.endDate > booking.date
                  ? `${formatDate(booking.date)} – ${formatDate(booking.endDate)} (${booking.days ?? 0} days)`
                  : formatDate(booking.date)}
              </dd>
              <dt className="text-muted-foreground">Time</dt>
              <dd className="col-span-2 font-medium">
                {formatRange(booking.start, booking.end)}
              </dd>
              <dt className="text-muted-foreground">Purpose</dt>
              <dd className="col-span-2 font-medium">{booking.purpose}</dd>
            </dl>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={onClose}>
                Book another
              </Button>
              <Button asChild>
                <Link to="/my-bookings" onClick={onClose}>
                  View my bookings
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
