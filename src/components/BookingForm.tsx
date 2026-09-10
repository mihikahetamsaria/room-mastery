import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatDate, formatRange, todayISO, type Purpose } from "@/lib/campus";
import { useOrganizations, useVenues } from "@/lib/data";
import { BookingConfirmation, type ConfirmedBooking } from "@/components/BookingConfirmation";
import { checkBookingConflictsFn, createBookingFn, updateBookingFn, type Conflict } from "@/lib/booking.functions";
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
type DayTiming = { date: string; start: string; end: string };
export type BookingFormValues = {
  purpose: string;
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
  const organization = organizations.find((org) => org.id === organizationId);
  const restrictedVenueCodes = new Set(["L1", "L2", "L3", "L8", "L9"]);
  const visibleVenues = venues.filter((venue) => !restrictedVenueCodes.has(venue.code) || organization?.abbreviation === "NCC" || organization?.abbreviation === "NSS");
  const queryClient = useQueryClient();
  const create = useServerFn(createBookingFn);
  const update = useServerFn(updateBookingFn);
  const checkConflicts = useServerFn(checkBookingConflictsFn);
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [start, setStart] = useState(initial?.start ?? "10:00");
  const [end, setEnd] = useState(initial?.end ?? "12:00");
  const [sameTime, setSameTime] = useState(true);
  const [dayTimings, setDayTimings] = useState<DayTiming[]>([]);
  const [venueIds, setVenueIds] = useState<string[]>(initial?.venueIds ?? []);
  const [conflicts, setConflicts] = useState<DatedConflict[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const rangeDates = endDate && endDate > date ? datesInRange(date, endDate) : [];
  useEffect(() => {
    if (!rangeDates.length) {
      setDayTimings([]);
      return;
    }
    setDayTimings((previous) => rangeDates.map((d) => previous.find((t) => t.date === d) ?? { date: d, start, end }));
  }, [date, endDate]);
  function toggleVenue(id: string) {
    setVenueIds((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]);
  }
  function setSameTimeMode(value: boolean) {
    setSameTime(value);
    setDayTimings(rangeDates.map((d) => ({ date: d, start, end })));
  }
  function updateDayTiming(dateValue: string, field: "start" | "end", value: string) {
    setDayTimings((previous) => previous.map((timing) => timing.date === dateValue ? { ...timing, [field]: value } : timing));
  }
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setConflicts([]);
    if (venueIds.length === 0) {
      toast.error("Select at least one venue.");
      return;
    }
    if (!purpose.trim()) {
      toast.error("Please specify the booking purpose.");
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
    const timings = isRange && !sameTime ? dayTimings : dates.map((d) => ({ date: d, start, end }));
    if (timings.length !== dates.length || timings.some((timing) => !timing.start || !timing.end || timing.end <= timing.start)) {
      toast.error("Each day must have a valid start and end time.");
      return;
    }
    setSubmitting(true);
    try {
      if (isRange) {
        const found: DatedConflict[] = [];
        for (const timing of timings) {
          const { conflicts: dayConflicts } = await checkConflicts({ data: { date: timing.date, start: timing.start, end: timing.end, venueIds } });
          found.push(...dayConflicts.map((c) => ({ ...c, date: timing.date })));
        }
        if (found.length > 0) {
          setConflicts(found);
          toast.error("Range booking rejected — venue clash detected.");
          return;
        }
        const bookingGroupId = crypto.randomUUID();
        let firstId = "";
        for (const timing of timings) {
          const result = await create({ data: { organizationId, purpose: purpose.trim(), date: timing.date, start: timing.start, end: timing.end, venueIds, bookingGroupId } });
          if (!result.ok) {
            setConflicts((result.conflicts ?? []).map((c) => ({ ...c, date: timing.date })));
            toast.error("Range booking rejected — venue clash detected.");
            return;
          }
          if (!firstId) firstId = result.booking_id ?? "";
        }
        await queryClient.invalidateQueries({ queryKey: ["bookings"] });
        toast.success(`${dates.length} bookings confirmed.`);
        setConfirmed({
          reference: firstId.slice(0, 8).toUpperCase(),
          purpose: purpose.trim() as Purpose,
          date,
          endDate,
          days: dates.length,
          start: timings[0]?.start ?? start,
          end: timings[0]?.end ?? end,
          timings: sameTime ? undefined : timings,
          venues: venues.filter((v) => venueIds.includes(v.id)).map((v) => v.code).join(", "),
          updated: false,
        });
        setVenueIds([]);
        onSuccess?.();
        return;
      }
      const payload = { organizationId, purpose: purpose.trim(), date, start, end, venueIds };
      const result = bookingId ? await update({ data: { ...payload, bookingId } }) : await create({ data: payload });
      if (!result.ok) {
        setConflicts(result.conflicts ?? []);
        toast.error("Booking rejected — venue clash detected.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(bookingId ? "Booking updated." : "Booking confirmed.");
      setConfirmed({
        reference: (result.booking_id ?? bookingId ?? "").slice(0, 8).toUpperCase(),
        purpose: purpose.trim() as Purpose,
        date,
        start,
        end,
        venues: venues.filter((v) => venueIds.includes(v.id)).map((v) => v.code).join(", "),
        updated: Boolean(bookingId),
      });
      if (!bookingId) setVenueIds([]);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }
  const form = (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="purpose">Purpose of booking</Label>
          <Input id="purpose" placeholder="Enter the exact purpose for which the room is required" value={purpose} onChange={(e) => setPurpose(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">{bookingId ? "Date" : "Start date"}</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        {!bookingId ? (
          <div className="space-y-2">
            <Label htmlFor="endDate">End date (optional)</Label>
            <Input id="endDate" type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        ) : null}
      </div>
      {!bookingId && endDate && endDate > date ? (
        <div className="space-y-4 rounded-md border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="same-time">Same timing for all days</Label>
              <p className="text-xs text-muted-foreground">Use the same start and end time for every selected date.</p>
            </div>
            <Switch id="same-time" checked={sameTime} onCheckedChange={setSameTimeMode} />
          </div>
          {sameTime ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start">Start time</Label>
                <Input id="start" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">End time</Label>
                <Input id="end" type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)} required />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Individual timings</Label>
              <div className="space-y-3">
                {dayTimings.map((timing) => (
                  <div key={timing.date} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
                    <div className="space-y-1">
                      <Label>{formatDate(timing.date)}</Label>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`start-${timing.date}`}>Start</Label>
                      <Input id={`start-${timing.date}`} type="time" step={60} value={timing.start} onChange={(e) => updateDayTiming(timing.date, "start", e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`end-${timing.date}`}>End</Label>
                      <Input id={`end-${timing.date}`} type="time" step={60} value={timing.end} onChange={(e) => updateDayTiming(timing.date, "end", e.target.value)} required />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start">Start time</Label>
            <Input id="start" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end">End time</Label>
            <Input id="end" type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label>Venue(s)</Label>
          <span className="text-xs text-muted-foreground">{venueIds.length} selected</span>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/40 p-3">
          {visibleVenues.map((venue) => {
            const selected = venueIds.includes(venue.id);
            return (
              <button type="button" key={venue.id} onClick={() => toggleVenue(venue.id)} aria-pressed={selected} className={cn("rounded border px-3 py-1.5 text-sm font-medium transition-colors", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary")}>
                {venue.code}
              </button>
            );
          })}
        </div>
      </div>
      {conflicts.length > 0 ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" />
            Booking rejected — {conflicts.length} clash{conflicts.length > 1 ? "es" : ""} found
          </p>
          <ul className="space-y-1 text-sm text-destructive">
            {conflicts.map((c, i) => (
              <li key={`${c.venue_code}-${c.date ?? ""}-${i}`}>
                {c.date ? `${formatDate(c.date)}: ` : ""}{c.venue_code} is already booked by {c.org_abbr}, {formatRange(c.start_time, c.end_time)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
  const confirmation = <BookingConfirmation booking={confirmed} onClose={() => setConfirmed(null)} />;
  if (embedded) return <>{form}{confirmation}</>;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking request</CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
      {confirmation}
    </>
  );
}
