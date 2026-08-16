"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession, signIn, signOut } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import {
  BookingError,
  cancelBooking,
  createBooking,
  getBooking,
  PaymentError,
  settlePayment,
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
  if (!parsed.success) return { error: "Enter a valid email address." };

  const result = await signIn(parsed.data);
  if (!result.ok) return { error: result.error };

  // Riders, drivers and controllers each land somewhere different.
  redirect(result.redirectTo);
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
});

export async function bookSeatAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Your session expired. Sign in again to book." };

  const parsed = bookingSchema.safeParse({
    tripId: formData.get("tripId"),
    boardStopId: formData.get("boardStopId"),
    alightStopId: formData.get("alightStopId"),
  });
  if (!parsed.success) return { error: "That booking request was incomplete. Try again." };

  let bookingId: string;
  try {
    const result = createBooking({
      tripId: parsed.data.tripId,
      employeeId: session.employee.id,
      boardStopId: parsed.data.boardStopId,
      alightStopId: parsed.data.alightStopId,
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
 * Paying a fare
 * ------------------------------------------------------------------ */

export async function payFareAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { error: "Your session expired. Sign in again to pay." };

  const paymentId = String(formData.get("paymentId") ?? "");
  const phone = String(formData.get("phone") ?? "");

  let paid;
  try {
    paid = settlePayment(paymentId, session.employee.id, phone);
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }

  revalidatePath("/pay");
  revalidatePath("/bookings");
  return {
    message: `Paid ${formatKes(paid.amountKes)}. M-Pesa receipt ${paid.reference}.`,
  };
}
