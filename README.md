# Campus Bookings Hub

# Lovable Prompt — College Club & Society Venue Booking Website

Copy everything below into Lovable as your project prompt.

---

Build a fully functional **College Club & Society Venue Booking System** — a real working web app with a database and authentication, not a static mockup.

## Tech Stack
Use whatever modern, production-ready stack Lovable defaults to for a full-stack app with auth and a database (e.g. React + Tailwind on the frontend, Supabase for auth/Postgres on the backend). The exact stack is flexible — what matters is that it's a real, working, responsive app backed by a real database and real authentication, not a static mockup.

## Organizations
Two categories of organizations, each with its own login:

**Clubs:** Robotics, ASME, SME, ASPS, IEEE, ES, SAE, ATS, IGS, IIM, SESI, ASCE, ACM
**Societies:** SAASC, APC, PDC, ROTARACT, EEB, HEB, PEB, ELC, EIC, SCC, WEC, CIM, NCC, NSS

## Authentication
- Each organization logs in with a username equal to its abbreviation (e.g. `ASME`, `NSS`) and a password.
- Seed every organization above as an account with a sample password (e.g. `Org@1234`), and store the org's display name, abbreviation, and category (club/society) in a linked organizations table.
- After login, a session is scoped to that organization: it can only create, edit, or cancel bookings that belong to itself. Enforce this at the backend/database level, not just by hiding UI elements.
- Include a basic logout flow.

## Database Schema
- `organizations`: id, name, abbreviation, category (club/society), auth_user_id
- `venues`: id, code (e.g. L20, T1, Auditorium), name/label
- `bookings`: id, organization_id (FK), purpose (enum), date, start_time, end_time, status (confirmed/cancelled), created_at, updated_at
- `booking_venues`: booking_id (FK), venue_id (FK) — join table so one booking can span multiple venues
- Seed `venues` with: L20–L31, T1–T8, Auditorium.
- Add a `role` field on the user/organization record: `org` (default) or `admin`. Seed one dedicated admin account (e.g. username `ADMIN`) alongside the club/society accounts.

## Admin Role
- A logged-in admin (e.g. Dean of Student Activities) can view, edit, and cancel **any** organization's bookings, not just their own — enforce this as an additional allow-branch in the backend access rules (admin bypasses the "own org only" restriction).
- Admin sees the same Calendar and Availability pages as everyone else, plus an "All Bookings" management view (like My Bookings, but across every organization, with an organization filter).
- Admin actions (edit/cancel on another org's booking) should still run through the same clash-detection logic when editing.
- Admin does not need their own "create booking on behalf of an org" flow unless trivial to add — focus on visibility + edit/cancel authority.

## Time Selection
- Start and end times are free-form (no fixed 15/30/60-minute snapping) — a simple time picker or `HH:MM` input is fine.
- No fixed campus booking window: organizations can book any time of day, including early morning or late night slots. Don't hardcode an 8 AM–10 PM (or similar) restriction anywhere in validation or the UI.

## Navigation
Top nav after login: **Dashboard | Book a Venue | Availability | Calendar | My Bookings | Logout**
For the admin account, add an extra **All Bookings** (or **Admin**) nav item giving cross-organization visibility and edit/cancel authority.

## Book a Venue Page
Form fields:
- Purpose: GBM, Workshop, Meeting, Seminar, Event, Practice, Other
- Venue(s): multi-select from L20–L31, T1–T8, Auditorium
- Date
- Start time / End time
- Submit button: "Check & Confirm Booking"

## Clash Detection (critical feature)
Before saving, for **each** selected venue, query all *confirmed* (non-cancelled) bookings on the same date where the requested time range overlaps an existing booked range for that venue (standard overlap check: `new_start < existing_end AND new_end > existing_start`).

- If any selected venue conflicts, **reject the entire booking** (don't partially book the non-conflicting rooms) and show a clear, specific error per conflict, e.g.:
  > ⚠️ L21 is already booked by ASME, 2:00–4:00 PM.
- If multiple venues conflict, list all conflicts at once.
- Bookings in different rooms, or in the same room at non-overlapping/adjacent times (e.g. one ends at 2:00 PM and the next starts at 2:00 PM), must be allowed.
- Only run clash checks against `confirmed` bookings — cancelled bookings must never block a room.

## Calendar Page
- Central calendar visible to all logged-in organizations, showing everyone's bookings.
- Monthly grid view AND a daily/weekly timetable view (toggle between them).
- Filters: by organization, by venue.
- Clicking a booking opens a detail popover/modal with: organization, purpose, venue(s), date, start–end time.

## My Bookings Page
- Shows only the logged-in organization's own bookings (upcoming and past).
- Actions per booking: View details, Edit (re-run clash detection on save), Cancel (soft delete — sets status to cancelled, keeps history, immediately frees the room).

## Availability Page
- User picks a date and a time range (or a single time).
- Shows a list/grid of all venues (L20–L31, T1–T8, Auditorium) marked **Available** or **Booked**.
- For booked venues, show which organization holds it and for what time.

## Dashboard
- After login: this organization's upcoming bookings (next few, soonest first).
- Basic stats: total bookings made by this org, bookings this week/month, most-used venue.
- Optionally: a small "today's bookings across campus" widget.

## Seed Data
Seed the database with realistic sample bookings across several organizations and venues, including:
- A few bookings that are clearly non-overlapping (for testing normal flow).
- At least two intentional near-clashes on the same venue/date to demonstrate clash detection when a user tries to book over them (e.g. ASME holds L21 on a given date 2:00–4:00 PM).
- A few bookings spanning multiple venues in one booking.
- At least one cancelled booking, to demonstrate that cancelled bookings don't block re-booking.

## Design
This should look like a **clean, professional college administrative system** — think campus facilities/booking portal, not a consumer SaaS landing page:
- Simple, structured layout: clear top nav, card-based lists, a real data table for bookings/calendar entries.
- Muted, institutional color palette (e.g. navy/maroon + white/gray, or the college's typical academic look), not gradients or flashy marketing visuals.
- Legible, dense information display (tables, badges for status/purpose) over large hero sections.
- Fully responsive for mobile and tablet use, since students will check availability from their phones.

## Non-negotiables
- Real, working authentication and a real database — no mock/local-only data.
- Clash detection must be enforced server-side (via a backend function or API route), not only checked client-side.
- Cancelling a booking must immediately and correctly free the venue for that time slot.
- The admin role must be enforced at the backend/database level, not just hidden/shown in the UI.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://campus-venue-master.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/75314668-3a86-48de-aaab-76e7de4efe49).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
