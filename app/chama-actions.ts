"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/app/actions";
import { actorFrom, getPrincipal } from "@/lib/auth";
import {
  acknowledgeConstitution,
  assignRole,
  castVote,
  ChamaError,
  closeChama,
  createChama,
  createProposal,
  createRequest,
  decideReceipt,
  decideRequest,
  executeRequest,
  getChama,
  joinChama,
  payoutOrder,
  postAnnouncement,
  requestExit,
  setNominee,
  startDistribution,
  submitReceipt,
  whoFromActor,
  type ChamaWho,
} from "@/lib/chama";
import { CHAMA_CURRENCIES, CHAMA_ROLES, isCategory, moveInOrder, parseMoney } from "@/lib/domain/chama";

/**
 * Chama server actions.
 *
 * Every one of them resolves the caller from the session and hands the rule
 * checks to `lib/chama.ts`. Nothing here decides who may move money; it only
 * parses forms and reports what the book said.
 */

async function who(): Promise<ChamaWho | null> {
  const principal = await getPrincipal();
  // Network staff oversee chamas; they are not members of them through this app.
  if (!principal || principal.kind === "operator") return null;
  return whoFromActor(actorFrom(principal));
}

async function run(chamaId: string, fn: (me: ChamaWho) => string | void): Promise<FormState> {
  const me = await who();
  if (!me) return { error: "Sign in to use chamas." };
  try {
    const message = fn(me);
    revalidatePath(`/chama/${chamaId}`);
    revalidatePath(`/chama/${chamaId}/books`);
    revalidatePath("/chama");
    return { message: message || "Done." };
  } catch (err) {
    if (err instanceof ChamaError) return { error: err.message };
    throw err;
  }
}

const str = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function money(data: FormData, key: string, currency: string): number | null {
  const raw = str(data, key);
  if (raw === "") return 0;
  return parseMoney(raw, currency);
}

/* ------------------------------------------------------------------ *
 * Creating and joining
 * ------------------------------------------------------------------ */

const createSchema = z.object({
  name: z.string().trim().min(3, "Give the chama a name.").max(80),
  description: z.string().trim().max(500),
  category: z.string().refine(isCategory, "Choose what kind of chama this is."),
  country: z.string().trim().length(2),
  currency: z.enum(CHAMA_CURRENCIES),
  visibility: z.enum(["private", "public"]),
  minMembers: z.coerce.number().int().min(2).max(500),
  maxMembers: z.coerce.number().int().min(2).max(500),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first contribution date."),
  graceDays: z.coerce.number().int().min(0).max(30),
  approvalsRequired: z.coerce.number().int().min(2, "At least two officers must sign.").max(10),
  reservePct: z.coerce.number().min(0).max(100),
  loanRatePct: z.coerce.number().min(0).max(10),
  loanMultiple: z.coerce.number().min(0).max(10),
  quorumPct: z.coerce.number().min(1, "Quorum must be at least 1%.").max(100),
  thresholdPct: z.coerce.number().gt(50, "A vote must need more than half to carry.").max(100),
  targetDate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

export async function createChamaAction(_prev: FormState, data: FormData): Promise<FormState> {
  const me = await who();
  if (!me) return { error: "Sign in to start a chama." };

  const parsed = createSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const f = parsed.data;

  const contribution = money(data, "contribution", f.currency);
  const entryFee = money(data, "entryFee", f.currency);
  const lateFee = money(data, "lateFee", f.currency);
  const target = money(data, "savingsTarget", f.currency);
  if (!contribution) return { error: "Set the contribution amount." };
  if (entryFee === null || lateFee === null) return { error: "Check the fee amounts." };
  if (target === null) return { error: "Check the savings target." };

  let id: string;
  try {
    id = createChama(
      {
        name: f.name,
        description: f.description,
        category: f.category as Parameters<typeof createChama>[0]["category"],
        country: f.country.toUpperCase(),
        currency: f.currency,
        visibility: f.visibility,
        minMembers: f.minMembers,
        maxMembers: f.maxMembers,
        entryFeeMinor: entryFee,
        contributionMinor: contribution,
        frequency: f.frequency,
        anchorDate: f.anchorDate,
        graceDays: f.graceDays,
        lateFeeMinor: lateFee,
        approvalsRequired: f.approvalsRequired,
        reserveBps: Math.round(f.reservePct * 100),
        loanRateBps: Math.round(f.loanRatePct * 100),
        loanMultipleTenths: Math.round(f.loanMultiple * 10),
        quorumBps: Math.round(f.quorumPct * 100),
        thresholdBps: Math.round(f.thresholdPct * 100),
        savingsTargetMinor: target,
        targetDate: f.targetDate || null,
      },
      me,
    ).id;
  } catch (err) {
    if (err instanceof ChamaError) return { error: err.message };
    throw err;
  }
  revalidatePath("/chama");
  redirect(`/chama/${id}/books`);
}

export async function findInviteAction(_prev: FormState, data: FormData): Promise<FormState> {
  const code = str(data, "code").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return { error: "An invitation code is 8 letters and numbers." };
  redirect(`/chama/join?code=${code}`);
}

export async function joinChamaAction(_prev: FormState, data: FormData): Promise<FormState> {
  const me = await who();
  if (!me) return { error: "Sign in to join." };
  if (data.get("accept") !== "on") return { error: "Tick the box to accept the constitution." };
  let id: string;
  try {
    id = joinChama(str(data, "code"), me, Number(data.get("version"))).id;
  } catch (err) {
    if (err instanceof ChamaError) return { error: err.message };
    throw err;
  }
  revalidatePath("/chama");
  redirect(`/chama/${id}`);
}

export async function acknowledgeAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  return run(chamaId, (me) => {
    acknowledgeConstitution(chamaId, me, Number(data.get("version")));
    return "Thank you — you've accepted the current constitution.";
  });
}

export async function assignRoleAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const role = str(data, "role");
  if (!(CHAMA_ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  return run(chamaId, (me) => {
    assignRole(chamaId, me, str(data, "memberKey"), role as (typeof CHAMA_ROLES)[number]);
    return "Role updated.";
  });
}

/* ------------------------------------------------------------------ *
 * Money in
 * ------------------------------------------------------------------ */

export async function submitReceiptAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const chama = getChama(chamaId);
  if (!chama) return { error: "That chama doesn't exist." };
  const amount = parseMoney(str(data, "amount"), chama.currency);
  if (!amount) return { error: "Enter the amount paid." };
  const kind = str(data, "kind");
  const rail = str(data, "rail");
  if (!["contribution", "entry_fee", "late_fee", "loan_repayment"].includes(kind)) return { error: "Choose what this payment is for." };
  if (!["mpesa", "bank", "cash"].includes(rail)) return { error: "Choose how it was paid." };

  return run(chamaId, (me) => {
    submitReceipt(chamaId, me, {
      memberKey: str(data, "memberKey") || me.key,
      kind: kind as "contribution",
      amountMinor: amount,
      rail: rail as "mpesa",
      reference: str(data, "reference"),
      loanId: str(data, "loanId") || null,
    });
    return "Recorded. It counts once another officer confirms it against the statement.";
  });
}

export async function decideReceiptAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const decision = str(data, "decision") === "reject" ? "reject" : "confirm";
  return run(chamaId, (me) => {
    decideReceipt(str(data, "receiptId"), me, decision, str(data, "note"));
    return decision === "confirm" ? "Confirmed and on the books." : "Rejected. The member can see why.";
  });
}

/* ------------------------------------------------------------------ *
 * Money out
 * ------------------------------------------------------------------ */

export async function createRequestAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const chama = getChama(chamaId);
  if (!chama) return { error: "That chama doesn't exist." };
  const kind = str(data, "kind");
  if (!["payout", "loan", "withdrawal", "welfare"].includes(kind)) return { error: "Choose a request type." };
  const amount = kind === "payout" ? undefined : parseMoney(str(data, "amount"), chama.currency);
  if (kind !== "payout" && !amount) return { error: "Enter an amount." };

  return run(chamaId, (me) => {
    createRequest(chamaId, me, {
      kind: kind as "loan",
      amountMinor: amount ?? undefined,
      reason: str(data, "reason") || (kind === "payout" ? "Round payout" : ""),
      beneficiary: str(data, "beneficiary") || undefined,
      loanMonths: Number(data.get("months")) || undefined,
    });
    return `Sent to the officers for ${chama.approvalsRequired} signatures.`;
  });
}

export async function decideRequestAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const decision = str(data, "decision") === "reject" ? "reject" : "approve";
  return run(chamaId, (me) => {
    const after = decideRequest(str(data, "requestId"), me, decision);
    return after.status === "approved"
      ? "Signed. That's enough signatures — the treasurer can now send it."
      : after.status === "rejected"
        ? "Refused. The request is closed."
        : "Signed. Waiting on another officer.";
  });
}

export async function executeRequestAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const rail = str(data, "rail");
  if (!["mpesa", "bank", "cash"].includes(rail)) return { error: "Choose how it was sent." };
  return run(chamaId, (me) => {
    executeRequest(str(data, "requestId"), me, rail as "mpesa", str(data, "reference"));
    return "Recorded as sent, and on the books.";
  });
}

/* ------------------------------------------------------------------ *
 * Votes and announcements
 * ------------------------------------------------------------------ */

const PROPOSAL_KINDS = ["general", "amendment", "chair", "payout_order", "dissolution"] as const;

export async function createProposalAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const kind = str(data, "kind") || "general";
  if (!(PROPOSAL_KINDS as readonly string[]).includes(kind)) return { error: "Choose what kind of vote this is." };
  return run(chamaId, (me) => {
    const mover = str(data, "mover");
    const order =
      kind === "payout_order" && mover
        ? moveInOrder(payoutOrder(chamaId), mover, Math.max(0, Number(data.get("position")) - 1))
        : undefined;
    createProposal(chamaId, me, {
      kind: kind as (typeof PROPOSAL_KINDS)[number],
      title: str(data, "title"),
      body: str(data, "body"),
      amendmentBody: str(data, "amendment") || undefined,
      candidate: str(data, "candidate") || undefined,
      order,
      days: Number(data.get("days")) || 7,
    });
    return "Put to the members.";
  });
}

export async function exitAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  if (data.get("confirm") !== "on") return { error: "Tick the box to confirm you want to leave." };
  return run(chamaId, (me) => {
    const request = requestExit(chamaId, me, str(data, "reason"));
    return request
      ? "Your refund has gone to the officers. You'll be marked as left once it's sent."
      : "You've left the chama. Your history stays on the books.";
  });
}

export async function nomineeAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const name = str(data, "nomineeName");
  return run(chamaId, (me) => {
    setNominee(chamaId, me, name ? { name, phone: str(data, "nomineePhone"), relation: str(data, "nomineeRelation") } : null);
    return name ? "Nominee saved. Only you and the group's officers can see it." : "Nominee removed.";
  });
}

export async function startDistributionAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  return run(chamaId, (me) => {
    const made = startDistribution(chamaId, me);
    return `${made.length} distribution payment${made.length === 1 ? "" : "s"} sent to the officers for signatures.`;
  });
}

export async function closeChamaAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  return run(chamaId, (me) => {
    closeChama(chamaId, me);
    return "The chama is closed. Its books stay readable.";
  });
}

export async function voteAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  const choice = str(data, "choice");
  if (!["yes", "no", "abstain"].includes(choice)) return { error: "Choose yes, no or abstain." };
  return run(chamaId, (me) => {
    castVote(str(data, "proposalId"), me, choice as "yes");
    return "Your vote is in.";
  });
}

export async function announceAction(_prev: FormState, data: FormData): Promise<FormState> {
  const chamaId = str(data, "chamaId");
  return run(chamaId, (me) => {
    postAnnouncement(chamaId, me, str(data, "body"));
    return "Posted to every member.";
  });
}
