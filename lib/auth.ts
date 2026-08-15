import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getCompany, getEmployee, getEmployeeByEmail } from "@/lib/queries";
import type { Company, Employee } from "@/lib/types";

const COOKIE = "vayliron_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Demo sign-in.
 *
 * Staff are identified by their work email alone — there is no password, no
 * OTP and no SSO here. That is deliberate for a seeded demo, and it is the
 * first thing to replace before this touches real employee data: swap
 * `signIn` for your identity provider and keep the rest of this module as is.
 */
function secret(): string {
  return process.env.SESSION_SECRET ?? "vayliron-dev-secret-not-for-production";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function verify(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface Session {
  employee: Employee;
  company: Company;
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;

  const employeeId = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!verify(employeeId, signature)) return null;

  const employee = getEmployee(employeeId);
  if (!employee || !employee.active) return null;

  const company = getCompany(employee.companyId);
  if (!company) return null;

  return { employee, company };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export type SignInResult =
  | { ok: true; employee: Employee }
  | { ok: false; error: string };

/** Establishes a session for a known work email. */
export async function signIn(email: string): Promise<SignInResult> {
  const employee = getEmployeeByEmail(email);
  if (!employee) {
    return {
      ok: false,
      error: "We don't recognise that work email. Ask your HR admin to add you to Vayliron.",
    };
  }

  const token = `${employee.id}.${sign(employee.id)}`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return { ok: true, employee };
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
