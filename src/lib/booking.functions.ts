import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Purpose } from "@/lib/campus";

export type Conflict = {
  venue_code: string;
  org_abbr: string;
  start_time: string;
  end_time: string;
};

export type BookingResult = {
  ok: boolean;
  conflicts?: Conflict[];
  booking_id?: string;
};

type CreateInput = {
  organizationId: string;
  purpose: Purpose;
  customPurpose?: string;
  date: string;
  start: string;
  end: string;
  venueIds: string[];
};

type UpdateInput = CreateInput & { bookingId: string };

export const createBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateInput) => input)
  .handler(async ({ data, context }): Promise<BookingResult> => {
    const { data: result, error } = await context.supabase.rpc("create_booking", {
      _organization_id: data.organizationId,
      _purpose: data.purpose,
      _custom_purpose: data.customPurpose ?? null,
      _date: data.date,
      _start: data.start,
      _end: data.end,
      _venue_ids: data.venueIds,
    });

    if (error) throw new Error(error.message);
    return result as unknown as BookingResult;
  });

export const updateBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateInput) => input)
  .handler(async ({ data, context }): Promise<BookingResult> => {
    const { data: result, error } = await context.supabase.rpc("update_booking", {
      _booking_id: data.bookingId,
      _purpose: data.purpose,
      _custom_purpose: data.customPurpose ?? null,
      _date: data.date,
      _start: data.start,
      _end: data.end,
      _venue_ids: data.venueIds,
    });

    if (error) throw new Error(error.message);
    return result as unknown as BookingResult;
  });

export const checkBookingConflictsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { date: string; start: string; end: string; venueIds: string[] }) =>
      input,
  )
  .handler(async ({ data, context }): Promise<{ conflicts: Conflict[] }> => {
    const { data: result, error } = await context.supabase.rpc("find_conflicts", {
      _venue_ids: data.venueIds,
      _date: data.date,
      _start: data.start,
      _end: data.end,
    });

    if (error) throw new Error(error.message);
    return { conflicts: (result ?? []) as Conflict[] };
  });

export const cancelBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_booking", {
      _booking_id: data.bookingId,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string }) => input)
  .handler(async ({ data, context }): Promise<BookingResult> => {
    const { data: result, error } = await context.supabase.rpc("restore_booking", {
      _booking_id: data.bookingId,
    });

    if (error) throw new Error(error.message);
    return result as unknown as BookingResult;
  });

export const deleteBookingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bookingId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("delete_booking", {
      _booking_id: data.bookingId,
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBookingFlagsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      bookingId: string;
      eventDone?: boolean;
      permissionSigned?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const patch: { event_done?: boolean; permission_signed?: boolean } = {};

    if (typeof data.eventDone === "boolean") {
      patch.event_done = data.eventDone;
    }

    if (typeof data.permissionSigned === "boolean") {
      patch.permission_signed = data.permissionSigned;
    }

    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await context.supabase
      .from("bookings")
      .update(patch)
      .eq("id", data.bookingId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
