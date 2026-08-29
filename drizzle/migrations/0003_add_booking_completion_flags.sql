ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS event_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permission_signed boolean NOT NULL DEFAULT false;