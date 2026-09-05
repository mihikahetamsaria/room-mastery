import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PURPOSES,
  formatDate,
  formatRange,
  todayISO,
  type Purpose,
} from "@/lib/campus";
import { useOrganizations, useVenues } from "@/lib/data";
import {
  BookingConfirmation,
  type ConfirmedBooking,
} from "@/components/BookingConfirmation";
import {
  checkBookingConflictsFn,
  createBookingFn,
  updateBookingFn,
  type Conflict,
} from "@/lib/booking.functions";

const MAX_RANGE_DAYS = 31;

function datesInRange(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromISO}T00:00:00`);
  const last = new Date(`${toISO}T00:00:00`);

  while (cursor <= last) {
    const m = `${cursor.getMonth() + 1}`.padStart(2, "0");
    const d = `${cursor.getDate()}`.padStart(2, "0");

    out.push(`${cursor.getFullYear()}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

type DatedConflict = Conflict & { date?: string };

export type BookingFormValues = {
  purpose: Purpose;
  customPurpose?: string;
  date: string;
  endDate?: string;
  start: string;
  end: string;
  venueIds: string[];
};

export function BookingForm({
  organizationId,
  bookingId,
  initial,
  submitLabel = "Check & Confirm Booking",
  onSuccess,
  embedded = false,
}: {
  organizationId: string;
  bookingId?: string;
  initial?: Partial<BookingFormValues>;
  submitLabel?: string;
  onSuccess?: () => void;
  embedded?: boolean;
}) {
  const { data: venues = [] } = useVenues();
  const { data: organizations = [] } = useOrganizations();

  const organization = organizations.find(
    (org) => org.id === organizationId,
  );

  const restrictedVenueCodes = new Set(["L1", "L2", "L3", "L8", "L9"]);

  const visibleVenues = venues.filter(
    (venue) =>
      !restrictedVenueCodes.has(venue.code) ||
      organization?.abbreviation === "NCC" ||
      organization?.abbreviation === "NSS",
  );

  const queryClient = useQueryClient();
  const create = useServerFn(createBookingFn);
  const update = useServerFn(updateBookingFn);
  const checkConflicts = useServerFn(checkBookingConflictsFn);

  const [purpose, setPurpose] = useState<Purpose>(
    initial?.purpose ?? "GBM",
  );

  const [customPurpose, setCustomPurpose] = useState(
    initial?.customPurpose ?? "",
  );
  
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [start, setStart] = useState(initial?.start ?? "10:00");
  const [end, setEnd] = useState(initial?.end ?? "12:00");
  const [venueIds, setVenueIds] = useState<string[]>(
    initial?.venueIds ?? [],
  );
  const [conflicts, setConflicts] = useState<DatedConflict[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);

  function toggleVenue(id: string) {
    setVenueIds((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : [...prev, id],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setConflicts([]);

    if (venueIds.length === 0) {
      toast.error("Select at least one venue.");
      return;
    }

    if (end <= start) {
      toast.error("End time must be after start time.");
      return;
    }

    const isRange = !bookingId && endDate && endDate > date;

    if (!bookingId && endDate && endDate < date) {
      toast.error("End date must be on or after the start date.");
      return;
    }

    const dates = isRange ? datesInRange(date, endDate) : [date];

    if (dates.length > MAX_RANGE_DAYS) {
      toast.error(`Date range can span at most ${MAX_RANGE_DAYS} days.`);
      return;
    }

    setSubmitting(true);

    try {
      if (isRange) {
        // All-or-nothing: check every date for clashes before booking any.
        const found: DatedConflict[] = [];

        for (const d of dates) {
          const { conflicts: dayConflicts } = await checkConflicts({
            data: { date: d, start, end, venueIds },
          });

          found.push(
            ...dayConflicts.map((c) => ({
              ...c,
              date: d,
            })),
          );
        }

        if (found.length > 0) {
          setConflicts(found);
          toast.error("Range booking rejected — venue clash detected.");
          return;
        }

        let firstId = "";

        for (const d of dates) {
          const result = await create({
            data: {
              organizationId,
              purpose,
              date: d,
              start,
              end,
              venueIds,
            },
          });

          if (!result.ok) {
            setConflicts(
              (result.conflicts ?? []).map((c) => ({
                ...c,
                date: d,
              })),
            );

            toast.error(
              "Range booking rejected — venue clash detected.",
            );

            return;
          }

          if (!firstId) {
            firstId = result.booking_id ?? "";
          }
        }

        await queryClient.invalidateQueries({
          queryKey: ["bookings"],
        });

        toast.success(`${dates.length} bookings confirmed.`);

        setConfirmed({
          reference: firstId.slice(0, 8).toUpperCase(),
          purpose,
          date,
          endDate,
          days: dates.length,
          start,
          end,
          venues: venues
            .filter((v) => venueIds.includes(v.id))
            .map((v) => v.code)
            .join(", "),
          updated: false,
        });

        setVenueIds([]);
        onSuccess?.();

        return;
      }

      const payload = {
        organizationId,
        purpose,
        date,
        start,
        end,
        venueIds,
      };

      const result = bookingId
        ? await update({
            data: {
              ...payload,
              bookingId,
            },
          })
        : await create({
            data: payload,
          });

      if (!result.ok) {
        setConflicts(result.conflicts ?? []);
        toast.error("Booking rejected — venue clash detected.");
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["bookings"],
      });

      toast.success(
        bookingId ? "Booking updated." : "Booking confirmed.",
      );

      setConfirmed({
        reference: (
          result.booking_id ??
          bookingId ??
          ""
        )
          .slice(0, 8)
          .toUpperCase(),
        purpose,
        date,
        start,
        end,
        venues: venues
          .filter((v) => venueIds.includes(v.id))
          .map((v) => v.code)
          .join(", "),
        updated: Boolean(bookingId),
      });

      if (!bookingId) {
        setVenueIds([]);
      }

      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }

 import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PURPOSES,
  formatDate,
  formatRange,
  todayISO,
  type Purpose,
} from "@/lib/campus";
import { useOrganizations, useVenues } from "@/lib/data";
import {
  BookingConfirmation,
  type ConfirmedBooking,
} from "@/components/BookingConfirmation";
import {
  checkBookingConflictsFn,
  createBookingFn,
  updateBookingFn,
  type Conflict,
} from "@/lib/booking.functions";

const MAX_RANGE_DAYS = 31;

function datesInRange(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${fromISO}T00:00:00`);
  const last = new Date(`${toISO}T00:00:00`);

  while (cursor <= last) {
    const m = `${cursor.getMonth() + 1}`.padStart(2, "0");
    const d = `${cursor.getDate()}`.padStart(2, "0");

    out.push(`${cursor.getFullYear()}-${m}-${d}`);

    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

type DatedConflict = Conflict & { date?: string };

export type BookingFormValues = {
  purpose: Purpose;
  customPurpose?: string;
  date: string;
  endDate?: string;
  start: string;
  end: string;
  venueIds: string[];
};

export function BookingForm({
  organizationId,
  bookingId,
  initial,
  submitLabel = "Check & Confirm Booking",
  onSuccess,
  embedded = false,
}: {
  organizationId: string;
  bookingId?: string;
  initial?: Partial<BookingFormValues>;
  submitLabel?: string;
  onSuccess?: () => void;
  embedded?: boolean;
}) {
  const { data: venues = [] } = useVenues();
  const { data: organizations = [] } = useOrganizations();

  const queryClient = useQueryClient();

  const create = useServerFn(createBookingFn);
  const update = useServerFn(updateBookingFn);
  const checkConflicts = useServerFn(checkBookingConflictsFn);

  const [purpose, setPurpose] = useState<Purpose>(
    initial?.purpose ?? "GBM",
  );

  const [customPurpose, setCustomPurpose] = useState(
    initial?.customPurpose ?? "",
  );

  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [start, setStart] = useState(initial?.start ?? "10:00");
  const [end, setEnd] = useState(initial?.end ?? "12:00");
  const [venueIds, setVenueIds] = useState<string[]>(
    initial?.venueIds ?? [],
  );

  const [conflicts, setConflicts] = useState<DatedConflict[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);

  const organization = organizations.find(
    (org) => org.id === organizationId,
  );

  const restrictedVenueCodes = new Set([
    "L1",
    "L2",
    "L3",
    "L8",
    "L9",
  ]);

  const visibleVenues = venues.filter(
    (venue) =>
      !restrictedVenueCodes.has(venue.code) ||
      organization?.abbreviation === "NCC" ||
      organization?.abbreviation === "NSS",
  );

  function toggleVenue(id: string) {
    setVenueIds((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : [...prev, id],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setConflicts([]);

    if (venueIds.length === 0) {
      toast.error("Select at least one venue.");
      return;
    }

    if (purpose === "Other" && !customPurpose.trim()) {
      toast.error("Please specify the booking purpose.");
      return;
    }

    if (end <= start) {
      toast.error("End time must be after start time.");
      return;
    }

    const isRange = !bookingId && endDate && endDate > date;

    if (!bookingId && endDate && endDate < date) {
      toast.error("End date must be on or after the start date.");
      return;
    }

    const dates = isRange
      ? datesInRange(date, endDate)
      : [date];

    if (dates.length > MAX_RANGE_DAYS) {
      toast.error(
        `Date range can span at most ${MAX_RANGE_DAYS} days.`,
      );
      return;
    }

    setSubmitting(true);

    try {
      if (isRange) {
        // All-or-nothing: check every date for clashes before booking any.
        const found: DatedConflict[] = [];

        for (const d of dates) {
          const { conflicts: dayConflicts } =
            await checkConflicts({
              data: {
                date: d,
                start,
                end,
                venueIds,
              },
            });

          found.push(
            ...dayConflicts.map((c) => ({
              ...c,
              date: d,
            })),
          );
        }

        if (found.length > 0) {
          setConflicts(found);
          toast.error(
            "Range booking rejected — venue clash detected.",
          );
          return;
        }

        let firstId = "";

        for (const d of dates) {
          const result = await create({
            data: {
              organizationId,
              purpose,
              customPurpose:
                purpose === "Other"
                  ? customPurpose.trim()
                  : undefined,
              date: d,
              start,
              end,
              venueIds,
            },
          });

          if (!result.ok) {
            setConflicts(
              (result.conflicts ?? []).map((c) => ({
                ...c,
                date: d,
              })),
            );

            toast.error(
              "Range booking rejected — venue clash detected.",
            );

            return;
          }

          if (!firstId) {
            firstId = result.booking_id ?? "";
          }
        }

        await queryClient.invalidateQueries({
          queryKey: ["bookings"],
        });

        toast.success(
          `${dates.length} bookings confirmed.`,
        );

        setConfirmed({
          reference: firstId.slice(0, 8).toUpperCase(),
          purpose,
          customPurpose: purpose === "Other" ? customPurpose.trim() : undefined,
          date,
          endDate,
          days: dates.length,
          start,
          end,
          venues: venues
            .filter((v) => venueIds.includes(v.id))
            .map((v) => v.code)
            .join(", "),
          updated: false,
        });

        setVenueIds([]);
        onSuccess?.();

        return;
      }

      const payload = {
        organizationId,
        purpose,
        customPurpose:
          purpose === "Other"
            ? customPurpose.trim()
            : undefined,
        date,
        start,
        end,
        venueIds,
      };

      const result = bookingId
        ? await update({
            data: {
              ...payload,
              bookingId,
            },
          })
        : await create({
            data: payload,
          });

      if (!result.ok) {
        setConflicts(result.conflicts ?? []);

        toast.error(
          "Booking rejected — venue clash detected.",
        );

        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["bookings"],
      });

      toast.success(
        bookingId
          ? "Booking updated."
          : "Booking confirmed.",
      );

      setConfirmed({
        reference: (
          result.booking_id ??
          bookingId ??
          ""
        )
          .slice(0, 8)
          .toUpperCase(),

        purpose,
        date,
        customPurpose: purpose === "Other" ? customPurpose.trim() : undefined,
        start,
        end,

        venues: venues
          .filter((v) => venueIds.includes(v.id))
          .map((v) => v.code)
          .join(", "),

        updated: Boolean(bookingId),
      });

      if (!bookingId) {
        setVenueIds([]);
      }

      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">

        {/* PURPOSE */}
        <div className="space-y-2">
          <Label htmlFor="purpose">
            Purpose
          </Label>

          <Select
            value={purpose}
            onValueChange={(v) => {
              const newPurpose = v as Purpose;

              setPurpose(newPurpose);

              if (newPurpose !== "Other") {
                setCustomPurpose("");
              }
            }}
          >
            <SelectTrigger id="purpose">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {PURPOSES.map((p) => (
                <SelectItem
                  key={p}
                  value={p}
                >
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {purpose === "Other" ? (
            <div className="space-y-2 pt-2">
              <Label htmlFor="customPurpose">
                Specify purpose
              </Label>

              <Input
                id="customPurpose"
                placeholder="Enter the purpose of your booking"
                value={customPurpose}
                onChange={(e) =>
                  setCustomPurpose(e.target.value)
                }
                required
              />
            </div>
          ) : null}
        </div>

        {/* DATE */}
        <div className="space-y-2">
          <Label htmlFor="date">
            {bookingId ? "Date" : "Start date"}
          </Label>

          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) =>
              setDate(e.target.value)
            }
            required
          />
        </div>

        {/* END DATE */}
        {!bookingId ? (
          <div className="space-y-2">
            <Label htmlFor="endDate">
              End date (optional range)
            </Label>

            <Input
              id="endDate"
              type="date"
              min={date}
              value={endDate}
              onChange={(e) =>
                setEndDate(e.target.value)
              }
            />

            {endDate && endDate > date ? (
              <p className="text-xs text-muted-foreground">
                Books the same slot every day from{" "}
                {formatDate(date)} to{" "}
                {formatDate(endDate)} — all
                days are booked, or none if any day
                clashes.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* START TIME */}
        <div className="space-y-2">
          <Label htmlFor="start">
            Start time
          </Label>

          <Input
            id="start"
            type="time"
            step={60}
            value={start}
            onChange={(e) =>
              setStart(e.target.value)
            }
            required
          />
        </div>

        {/* END TIME */}
        <div className="space-y-2">
          <Label htmlFor="end">
            End time
          </Label>

          <Input
            id="end"
            type="time"
            step={60}
            value={end}
            onChange={(e) =>
              setEnd(e.target.value)
            }
            required
          />
        </div>
      </div>

      {/* VENUES */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>
            Venue(s)
          </Label>

          <span className="text-xs text-muted-foreground">
            {venueIds.length} selected
          </span>
        </div>

        <div className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/40 p-3">
          {visibleVenues.map((venue) => {
            const selected =
              venueIds.includes(venue.id);

            return (
              <button
                type="button"
                key={venue.id}
                onClick={() =>
                  toggleVenue(venue.id)
                }
                aria-pressed={selected}
                className={cn(
                  "rounded border px-3 py-1.5 text-sm font-medium transition-colors",

                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                {venue.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONFLICTS */}
      {conflicts.length > 0 ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" />

            Booking rejected —{" "}
            {conflicts.length}{" "}
            clash
            {conflicts.length > 1
              ? "es"
              : ""}{" "}
            found
          </p>

          <ul className="space-y-1 text-sm text-destructive">
            {conflicts.map((c, i) => (
              <li
                key={`${c.venue_code}-${c.date ?? ""}-${i}`}
              >
                ⚠️{" "}
                {c.date
                  ? `${formatDate(c.date)}: `
                  : ""}

                {c.venue_code} is already booked
                by {c.org_abbr},{" "}
                {formatRange(
                  c.start_time,
                  c.end_time,
                )}
                .
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* SUBMIT */}
      <Button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto"
      >
        {submitting ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : null}

        {submitLabel}
      </Button>
    </form>
  );

  const confirmation = (
    <BookingConfirmation
      booking={confirmed}
      onClose={() =>
        setConfirmed(null)
      }
    />
  );

  if (embedded) {
    return (
      <>
        {form}
        {confirmation}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Booking request
          </CardTitle>
        </CardHeader>

        <CardContent>
          {form}
        </CardContent>
      </Card>

      {confirmation}
    </>
  );
}

  const confirmation = (
    <BookingConfirmation
      booking={confirmed}
      onClose={() => setConfirmed(null)}
    />
  );

  if (embedded) {
    return (
      <>
        {form}
        {confirmation}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Booking request
          </CardTitle>
        </CardHeader>

        <CardContent>{form}</CardContent>
      </Card>

      {confirmation}
    </>
  );
}
