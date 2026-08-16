import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import type { Actor } from "@/lib/audit";
import { getDriver, getDriverByEmail, getOperator, getOperatorByEmail } from "@/lib/ops";
import { getOwner, getOwnerByEmail } from "@/lib/owners";
import { getCompany, getEmployee, getEmployeeByEmail } from "@/lib/queries";
import type { Company, Driver, Employee, Operator, Owner } from "@/lib/types";

const COOKIE = "vayliron_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

/**
 * Demo sign-in.
 *
 * Everyone is identified by email alone — no password, no OTP and no SSO.
 * That is deliberate for a seeded demo, and it is the first thing to replace
 * before this touches real staff data: swap `signIn` for your identity
 * provider and the rest of this module stands as it is.
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

/**
 * Who is signed in.
 *
 * Four kinds of people use Vayliron and they are not variations of one
 * account: a commuter belongs to a client company, a driver works the door, a
 * controller works for Vayliron itself, and an owner owns the actual bus.
 * Modelling them as one "user" row with a role column would mean every query
 * carried a nullable company id it could not trust.
 */
export type Principal =
  | { kind: "employee"; employee: Employee; company: Company }
  | { kind: "driver"; driver: Driver }
  | { kind: "operator"; operator: Operator }
  | { kind: "owner"; owner: Owner };

export type PrincipalKind = Principal["kind"];

/** Where each kind of person lands after signing in. */
export function homePath(principal: Principal): string {
  switch (principal.kind) {
    case "operator":
      return "/ops";
    case "driver":
      return "/drive";
    case "owner":
      return "/fleet";
    default:
      return "/dashboard";
  }
}

export function displayName(principal: Principal): string {
  switch (principal.kind) {
    case "operator":
      return principal.operator.name;
    case "driver":
      return principal.driver.name;
    case "owner":
      return principal.owner.contactName;
    default:
      return principal.employee.name;
  }
}

export function displayOrg(principal: Principal): string {
  switch (principal.kind) {
    case "operator":
      return principal.operator.role === "superadmin"
        ? "Vayliron · Network admin"
        : "Vayliron · Control";
    case "driver":
      return "Vayliron · Driver";
    case "owner":
      return principal.owner.name;
    default:
      return principal.company.name;
  }
}

/** The audit identity for whoever is acting. */
export function actorFrom(principal: Principal): Actor {
  switch (principal.kind) {
    case "operator":
      return {
        kind: "operator",
        id: principal.operator.id,
        name: principal.operator.name,
      };
    case "driver":
      return { kind: "driver", id: principal.driver.id, name: principal.driver.name };
    case "owner":
      return { kind: "owner", id: principal.owner.id, name: principal.owner.name };
    default:
      return {
        kind: "employee",
        id: principal.employee.id,
        name: principal.employee.name,
        companyId: principal.company.id,
      };
  }
}

export async function getPrincipal(): Promise<Principal | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;

  const subject = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!verify(subject, signature)) return null;

  const [kind, id] = splitSubject(subject);
  if (!kind || !id) return null;

  if (kind === "operator") {
    const operator = getOperator(id);
    return operator && operator.active ? { kind: "operator", operator } : null;
  }

  if (kind === "driver") {
    const driver = getDriver(id);
    return driver && driver.active ? { kind: "driver", driver } : null;
  }

  if (kind === "owner") {
    const owner = getOwner(id);
    return owner && owner.active ? { kind: "owner", owner } : null;
  }

  const employee = getEmployee(id);
  if (!employee || !employee.active) return null;
  const company = getCompany(employee.companyId);
  return company ? { kind: "employee", employee, company } : null;
}

function splitSubject(subject: string): [PrincipalKind | null, string | null] {
  const at = subject.indexOf(":");
  if (at < 1) return [null, null];
  const kind = subject.slice(0, at);
  const id = subject.slice(at + 1);
  if (kind !== "employee" && kind !== "driver" && kind !== "operator" && kind !== "owner") {
    return [null, null];
  }
  return [kind, id];
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

export interface Session {
  employee: Employee;
  company: Company;
}

/** The rider session. Null for drivers and controllers, who are not riders. */
export async function getSession(): Promise<Session | null> {
  const principal = await getPrincipal();
  if (principal?.kind !== "employee") return null;
  return { employee: principal.employee, company: principal.company };
}

/** A rider session that also administers their company's account. */
export async function getCompanyAdmin(): Promise<Session | null> {
  const session = await getSession();
  return session && session.employee.role === "admin" ? session : null;
}

export async function getDriverSession(): Promise<Driver | null> {
  const principal = await getPrincipal();
  return principal?.kind === "driver" ? principal.driver : null;
}

/** The bus owner's session, for the fleet control panel. */
export async function getOwnerSession(): Promise<Owner | null> {
  const principal = await getPrincipal();
  return principal?.kind === "owner" ? principal.owner : null;
}

export async function getOperatorSession(): Promise<Operator | null> {
  const principal = await getPrincipal();
  return principal?.kind === "operator" ? principal.operator : null;
}

/** Network editing — routes, fleet, client contracts — is superadmin only. */
export async function getNetworkAdmin(): Promise<Operator | null> {
  const operator = await getOperatorSession();
  return operator?.role === "superadmin" ? operator : null;
}

/* ------------------------------------------------------------------ *
 * Sign in / out
 * ------------------------------------------------------------------ */

export type SignInResult =
  | { ok: true; principal: Principal; redirectTo: string }
  | { ok: false; error: string };

/**
 * Resolves an email against all four directories.
 *
 * Controllers are checked first and riders last, because a Vayliron
 * controller who also rides should land on the operations board.
 */
export async function signIn(email: string): Promise<SignInResult> {
  const trimmed = email.trim();

  const operator = getOperatorByEmail(trimmed);
  if (operator) return establish({ kind: "operator", operator });

  const driver = getDriverByEmail(trimmed);
  if (driver) return establish({ kind: "driver", driver });

  const owner = getOwnerByEmail(trimmed);
  if (owner) return establish({ kind: "owner", owner });

  const employee = getEmployeeByEmail(trimmed);
  if (employee) {
    const company = getCompany(employee.companyId);
    if (company) return establish({ kind: "employee", employee, company });
  }

  return {
    ok: false,
    error:
      "We don't recognise that email. Ask your HR admin or your Vayliron contact to add you.",
  };
}

async function establish(principal: Principal): Promise<SignInResult> {
  const id =
    principal.kind === "operator"
      ? principal.operator.id
      : principal.kind === "driver"
        ? principal.driver.id
        : principal.kind === "owner"
          ? principal.owner.id
          : principal.employee.id;

  const subject = `${principal.kind}:${id}`;
  (await cookies()).set(COOKIE, `${subject}.${sign(subject)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return { ok: true, principal, redirectTo: homePath(principal) };
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
