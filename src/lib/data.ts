import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Purpose } from "@/lib/campus";

export type Venue = { id: string; code: string; label: string; sort_order: number };
export type Organization = {
  id: string;
  name: string;
  abbreviation: string;
  category: "club" | "society";
};

export type BookingRow = {
  id: string;
  organization_id: string;
  purpose: Purpose;
  custom_purpose: string | null;
  date: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled";
  event_done: boolean;
  permission_signed: boolean;
  organizations: { name: string; abbreviation: string; category: string } | null;
  booking_venues: { venues: { id: string; code: string } | null }[];
};

const BOOKING_SELECT =
  "id,organization_id,purpose,custom_purpose,date,start_time,end_time,status,event_done,permission_signed,organizations(name,abbreviation,category),booking_venues(venues(id,code))";

export function useVenues() {
  return useQuery({
    queryKey: ["venues"],
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await supabase
        .from("venues")
        .select("id,code,label,sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: async (): Promise<Organization[]> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,abbreviation,category")
        .order("abbreviation");
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBookings() {
  return useQuery({
    queryKey: ["bookings"],
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .order("date")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });
}

export function venueCodes(booking: BookingRow) {
  return booking.booking_venues
    .map((bv) => bv.venues?.code)
    .filter((c): c is string => Boolean(c))
    .sort();
}
