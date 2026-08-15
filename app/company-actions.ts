"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/app/actions";
import { getCompanyAdmin } from "@/lib/auth";
import {
  createEmployee,
  PeopleError,
  setEmployeeActive,
  updateCompanyPolicy,
  updateEmployee,
} from "@/lib/ops";
import { listEmployees } from "@/lib/queries";

function refreshCompany(): void {
  revalidatePath("/company");
  revalidatePath("/company/people");
  revalidatePath("/company/policy");
  revalidatePath("/company/invoices");
}

const newEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().regex(/^\+254\d{9}$/, "Use a +254 number, for example +254712345678."),
  staffNo: z.string().trim().min(1).max(24),
  homeStopId: z.string().trim().optional(),
  workStopId: z.string().trim().optional(),
  role: z.enum(["employee", "admin"]),
});

export async function addEmployeeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCompanyAdmin();
  if (!admin) return { error: "Only your company's Vayliron admins can add staff." };

  const parsed = newEmployeeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    staffNo: formData.get("staffNo"),
    homeStopId: formData.get("homeStopId") || undefined,
    workStopId: formData.get("workStopId") || undefined,
    role: formData.get("role") || "employee",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  try {
    createEmployee({
      companyId: admin.company.id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      staffNo: parsed.data.staffNo,
      homeStopId: parsed.data.homeStopId ?? null,
      workStopId: parsed.data.workStopId ?? null,
      role: parsed.data.role,
    });
  } catch (err) {
    if (err instanceof PeopleError) return { error: err.message };
    throw err;
  }

  refreshCompany();
  return { message: `${parsed.data.name} can now sign in with ${parsed.data.email.toLowerCase()}.` };
}

const patchEmployeeSchema = z.object({
  employeeId: z.string().min(1),
  homeStopId: z.string().optional(),
  workStopId: z.string().optional(),
  role: z.enum(["employee", "admin"]),
  phone: z.string().trim().min(6).max(20),
});

export async function updateEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await getCompanyAdmin();
  if (!admin) return { error: "Only your company's Vayliron admins can edit staff." };

  const parsed = patchEmployeeSchema.safeParse({
    employeeId: formData.get("employeeId"),
    homeStopId: formData.get("homeStopId") ?? undefined,
    workStopId: formData.get("workStopId") ?? undefined,
    role: formData.get("role") || "employee",
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { error: "Check the details and try again." };

  // A company must keep at least one admin, or nobody can administer it.
  if (
    parsed.data.role === "employee" &&
    parsed.data.employeeId === admin.employee.id &&
    !hasAnotherAdmin(admin.company.id, admin.employee.id)
  ) {
    return { error: "You are the only admin on this account — promote someone else first." };
  }

  try {
    updateEmployee(parsed.data.employeeId, admin.company.id, {
      homeStopId: parsed.data.homeStopId || null,
      workStopId: parsed.data.workStopId || null,
      role: parsed.data.role,
      phone: parsed.data.phone,
    });
  } catch (err) {
    if (err instanceof PeopleError) return { error: err.message };
    throw err;
  }

  refreshCompany();
  return { message: "Saved." };
}

export async function setEmployeeActiveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await getCompanyAdmin();
  if (!admin) return { error: "Only your company's Vayliron admins can do that." };

  const employeeId = String(formData.get("employeeId") ?? "");
  const active = formData.get("active") === "1";

  if (!active && employeeId === admin.employee.id) {
    return { error: "You cannot deactivate your own account." };
  }

  try {
    const { releasedSeats } = setEmployeeActive(employeeId, admin.company.id, active);
    refreshCompany();
    if (active) return { message: "Reactivated." };
    return {
      message:
        releasedSeats > 0
          ? `Deactivated. ${releasedSeats} upcoming ${releasedSeats === 1 ? "seat was" : "seats were"} released back on sale.`
          : "Deactivated.",
    };
  } catch (err) {
    if (err instanceof PeopleError) return { error: err.message };
    throw err;
  }
}

const policySchema = z.object({
  subsidyPct: z.coerce.number().min(0).max(100),
  monthlyCapKes: z.coerce.number().int().min(0).max(1000000),
  billingEmail: z.string().trim().email().max(160),
});

export async function updatePolicyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCompanyAdmin();
  if (!admin) return { error: "Only your company's Vayliron admins can change the policy." };

  const parsed = policySchema.safeParse({
    subsidyPct: formData.get("subsidyPct"),
    monthlyCapKes: formData.get("monthlyCapKes"),
    billingEmail: formData.get("billingEmail"),
  });
  if (!parsed.success) {
    return { error: "Enter an employer share between 0 and 100 and a valid billing email." };
  }

  try {
    updateCompanyPolicy(admin.company.id, {
      subsidyBps: Math.round(parsed.data.subsidyPct * 100),
      monthlyCapKes: parsed.data.monthlyCapKes,
      billingEmail: parsed.data.billingEmail,
    });
  } catch (err) {
    if (err instanceof PeopleError) return { error: err.message };
    throw err;
  }

  refreshCompany();
  return {
    message:
      "Policy saved. It applies to seats booked from now on — trips already booked keep the split they were quoted.",
  };
}

/** A company must always keep at least one admin who can administer it. */
function hasAnotherAdmin(companyId: string, exceptEmployeeId: string): boolean {
  return listEmployees(companyId).some(
    (e) => e.role === "admin" && e.active === 1 && e.id !== exceptEmployeeId,
  );
}
