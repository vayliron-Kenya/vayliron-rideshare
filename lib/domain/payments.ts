/**
 * Money, and where it goes.
 *
 * Vayliron does not own the buses. Somebody in Kasarani bought a matatu, put it
 * on a route, and lets the network sell places on it — so every shilling a
 * rider pays is split at the moment it is taken: most of it is the owner's,
 * the rest is the network's commission for the app, the payments and the
 * dispatch. The split is stored on the payment row rather than recomputed,
 * because changing an owner's rate next month must not rewrite last month.
 */

export interface PaymentSplit {
  amountKes: number;
  ownerKes: number;
  networkKes: number;
}

/**
 * Splits a fare between the bus owner and Vayliron.
 *
 * Rounds the owner's share down and gives the remainder to the network, so the
 * two halves always add back to exactly what the rider paid — a floating-point
 * split that loses a shilling is a reconciliation problem later.
 */
export function splitPayment(amountKes: number, payoutBps: number): PaymentSplit {
  if (amountKes < 0) throw new RangeError("amount cannot be negative");
  if (payoutBps < 0 || payoutBps > 10000) throw new RangeError("payout_bps out of range");

  const ownerKes = Math.floor((amountKes * payoutBps) / 10000);
  return { amountKes, ownerKes, networkKes: amountKes - ownerKes };
}

/**
 * Kenyan mobile numbers reach M-Pesa in several shapes — 0722…, 254722…,
 * +254 722 …  — and all of them are the same phone. Normalised to the
 * international form Safaricom's API expects, or null if it is not a number
 * anyone could push to.
 */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");

  // 0712345678 -> 254712345678
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  // 712345678 -> 254712345678
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  // already international
  if (/^254[17]\d{8}$/.test(digits)) return digits;

  return null;
}

/** How a normalised number is shown back to the rider: +254 712 345 678. */
export function formatPhone(normalised: string): string {
  if (!/^254\d{9}$/.test(normalised)) return normalised;
  return `+254 ${normalised.slice(3, 6)} ${normalised.slice(6, 9)} ${normalised.slice(9)}`;
}

/**
 * An M-Pesa receipt number. The real ones come back from Safaricom; this app
 * has no Daraja credentials, so it mints one in the same shape and says so on
 * screen rather than pretending a payment cleared.
 */
const RECEIPT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateReceipt(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < 10; i += 1) {
    code += RECEIPT_ALPHABET[Math.floor(random() * RECEIPT_ALPHABET.length)];
  }
  return code;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  cash: "Cash to the conductor",
  employer: "Billed to your employer",
};
