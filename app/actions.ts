"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession, signIn, signOut } from "@/lib/auth";
import {
  boardByPassCode,
  BookingError,
  cancelBooking,
  closeTrip,
  createBooking,
  getBooking,
  getTrip,
} from "@/lib/queries";

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

export interface FormState {
  error?: string;
  message?: string;
}

const emailSchema = z.string().trim().min(3).max(160).email();

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid work email address." };

  const result = await signIn(parsed.data);
  if (!result.ok) return { error: result.error };

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/");
}

/* ------------------------------------------------------------------ *
 * Booking
 * ------------------------------------------------------------------ */

const bookingSchema = z.object({
  tripId: z.string().min(1),
  boardStopId: z.string().min(1),
  alightStopId: z.string().min(1),
  seatNo: z.coerce.number().int().positive().optional(),
});

export async function bookSeatAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Your session expired. Sign in again to book." };

  const raw = {
    tripId: formData.get("tripId"),
    boardStopId: formData.get("boardStopId"),
    alightStopId: formData.get("alightStopId"),
    seatNo: formData.get("seatNo") || undefined,
  };

  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) return { error: "That booking request was incomplete. Try again." };

  let bookingId: string;
  try {
    const result = createBooking({
      tripId: parsed.data.tripId,
      employeeId: session.employee.id,
      boardStopId: parsed.data.boardStopId,
      alightStopId: parsed.data.alightStopId,
      seatNo: parsed.data.seatNo,
    });
    bookingId = result.booking.id;
  } catch (err) {
    if (err instanceof BookingError) return { error: err.message };
    throw err;
  }

  revalidatePath("/dashboard");
  revalidatePath("/bookings");
  redirect(`/bookings?highlight=${bookingId}`);
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/");

  const bookingId = String(formData.get("bookingId") ?? "");
  const booking = getBooking(bookingId);
  if (booking) cancelBooking(bookingId, session.employee.id);

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
}

/* ------------------------------------------------------------------ *
 * Driver / conductor
 * ------------------------------------------------------------------ */

export async function boardPassAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Sign in to run the door." };

  const tripId = String(formData.get("tripId") ?? "");
  const passCode = String(formData.get("passCode") ?? "").trim();
  if (!tripId || !passCode) return { error: "Enter a boarding pass code." };

  const trip = getTrip(tripId);
  if (!trip) return { error: "That departure no longer exists." };

  const result = boardByPassCode(tripId, passCode);
  revalidatePath(`/driver/${tripId}`);

  if (result.ok) {
    return {
      message: `Seat ${result.entry.booking.seatNo} · ${result.entry.employee.name} (${result.entry.companyName}) — boarded at ${result.entry.boardStop.name}.`,
    };
  }

  switch (result.reason) {
    case "already_boarded":
      return { error: "That pass has already been scanned on this bus." };
    case "wrong_trip":
      return { error: "That pass is for a different departure." };
    default:
      return { error: "No booking matches that code." };
  }
}

export async function closeTripAction(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/");

  const tripId = String(formData.get("tripId") ?? "");
  if (tripId) closeTrip(tripId);

  revalidatePath(`/driver/${tripId}`);
  revalidatePath("/driver");
}
