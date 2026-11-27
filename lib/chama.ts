import "server-only";

import { randomBytes } from "node:crypto";

import { record, type Actor } from "@/lib/audit";
import { db, tx } from "@/lib/db";
import {
  approvalPossible,
  approvalState,
  can,
  collectionsByPeriod,
  distributionShares,
  exitSettlement,
  loanOverdue,
  reorderAllowed,
  targetProgressBps,
  canSign,
  categoryFor,
  constitutionTemplate,
  formatMoney,
  loanLimit,
  loanSchedule,
  loanTotal,
  nextDueDate,
  periodsDue,
  potSize,
  reserveFor,
  rotationSchedule,
  standing,
  voteOutcome,
  voteSettled,
  type ChamaCategoryKey,
  type ChamaPermission,
  type ChamaRole,
  type Frequency,
  type Installment,
  type PeriodCollection,
  type RotationSlot,
  type Standing,
} from "@/lib/domain/chama";
import { nairobiDate } from "@/lib/domain/time";

/**
 * Chamas: the group's book.
 *
 * The rules that decide a number live in `lib/domain/chama.ts`. This module
 * owns who may do what, in what order, and what gets written:
 *
 * - Money in is recorded by one person and confirmed by another officer before
 *   it reaches the ledger.
 * - Money out is a request that needs `approvals_required` officers who are
 *   neither the requester nor the recipient, then a treasurer who records the
 *   reference the payment rail issued.
 * - The ledger is append-only, enforced by triggers in the schema.
 *
 * The app never holds or moves funds itself. Every balance shown is the sum of
 * confirmed ledger entries, each carrying a real payment reference.
 */

type Row = Record<string, unknown>;

export class ChamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChamaError";
  }
}

/** Someone acting in a chama: their member key, and who they are for the audit trail. */
export interface ChamaWho {
  key: string;
  name: string;
  actor: Actor;
}

/**
 * A chama is personal, not the employer's business. The audit actor is
 * stripped of its company so a rider's savings group never shows up in their
 * HR team's activity log.
 */
export function whoFromActor(actor: Actor): ChamaWho {
  const { companyId: _drop, ...personal } = actor;
  return { key: `${actor.kind}:${actor.id}`, name: actor.name, actor: personal };
}

export type Rail = "mpesa" | "bank" | "cash";
export const RAILS: { value: Rail; label: string; hint: string }[] = [
  { value: "mpesa", label: "M-Pesa", hint: "The 10-character transaction code, e.g. SJK4H7Q2XP" },
  { value: "bank", label: "Bank transfer", hint: "The bank's transaction or slip reference" },
  { value: "cash", label: "Cash at a meeting", hint: "The meeting date and minute number" },
];

const MPESA_CODE = /^[A-Z0-9]{10}$/;

export function normaliseReference(rail: Rail, input: string): string | null {
  const ref = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (rail === "mpesa") return MPESA_CODE.test(ref) ? ref : null;
  return ref.length >= 3 && ref.length <= 60 ? ref : null;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export interface Chama {
  id: string;
  name: string;
  description: string;
  category: ChamaCategoryKey;
  country: string;
  currency: string;
  visibility: "private" | "public";
  inviteCode: string;
  minMembers: number;
  maxMembers: number;
  entryFeeMinor: number;
  contributionMinor: number;
  frequency: Frequency;
  anchorDate: string;
  graceDays: number;
  lateFeeMinor: number;
  approvalsRequired: number;
  reserveBps: number;
  loanRateBps: number;
  loanMultipleTenths: number;
  quorumBps: number;
  thresholdBps: number;
  savingsTargetMinor: number;
  targetDate: string | null;
  status: "forming" | "active" | "dissolving" | "dissolved";
  createdBy: string;
  createdAt: string;
  constitutionVersion: number;
}

const toChama = (r: Row): Chama => ({
  id: r.id as string,
  name: r.name as string,
  description: r.description as string,
  category: r.category as ChamaCategoryKey,
  country: r.country as string,
  currency: r.currency as string,
  visibility: r.visibility as Chama["visibility"],
  inviteCode: r.invite_code as string,
  minMembers: r.min_members as number,
  maxMembers: r.max_members as number,
  entryFeeMinor: r.entry_fee_minor as number,
  contributionMinor: r.contribution_minor as number,
  frequency: r.frequency as Frequency,
  anchorDate: r.anchor_date as string,
  graceDays: r.grace_days as number,
  lateFeeMinor: r.late_fee_minor as number,
  approvalsRequired: r.approvals_required as number,
  reserveBps: r.reserve_bps as number,
  loanRateBps: r.loan_rate_bps as number,
  loanMultipleTenths: r.loan_multiple_tenths as number,
  quorumBps: r.quorum_bps as number,
  thresholdBps: r.threshold_bps as number,
  savingsTargetMinor: (r.savings_target_minor as number) ?? 0,
  targetDate: (r.target_date as string) ?? null,
  status: r.status as Chama["status"],
  createdBy: r.created_by as string,
  createdAt: r.created_at as string,
  constitutionVersion: (r.constitution_version as number) ?? 1,
});

const CHAMA_SELECT = `
  SELECT c.*, (SELECT MAX(version) FROM chama_constitutions k WHERE k.chama_id = c.id) AS constitution_version
    FROM chamas c`;

export function getChama(id: string): Chama | null {
  const row = db().prepare(`${CHAMA_SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  return row ? toChama(row) : null;
}

export function getChamaByInvite(code: string): Chama | null {
  const row = db()
    .prepare(`${CHAMA_SELECT} WHERE c.invite_code = ?`)
    .get(code.trim().toUpperCase()) as Row | undefined;
  return row ? toChama(row) : null;
}

export interface Member {
  key: string;
  name: string;
  role: ChamaRole;
  status: "active" | "exited";
  joinedOn: string;
  payoutPosition: number | null;
  acknowledgedVersion: number;
  exitedOn: string | null;
  nominee: { name: string; phone: string; relation: string } | null;
}

const toMember = (r: Row): Member => ({
  key: r.member_key as string,
  name: r.name as string,
  role: r.role as ChamaRole,
  status: r.status as Member["status"],
  joinedOn: r.joined_on as string,
  payoutPosition: (r.payout_position as number) ?? null,
  acknowledgedVersion: r.acknowledged_version as number,
  exitedOn: (r.exited_on as string) ?? null,
  nominee: r.nominee_name
    ? { name: r.nominee_name as string, phone: (r.nominee_phone as string) ?? "", relation: (r.nominee_relation as string) ?? "" }
    : null,
});

export function listMembers(chamaId: string, includeExited = false): Member[] {
  return (
    db()
      .prepare(
        `SELECT * FROM chama_members WHERE chama_id = ? ${includeExited ? "" : "AND status = 'active'"}
          ORDER BY COALESCE(payout_position, 1e9), joined_on, name`,
      )
      .all(chamaId) as Row[]
  ).map(toMember);
}

export function getMember(chamaId: string, key: string): Member | null {
  const row = db()
    .prepare(`SELECT * FROM chama_members WHERE chama_id = ? AND member_key = ?`)
    .get(chamaId, key) as Row | undefined;
  return row ? toMember(row) : null;
}

export interface ChamaSummary {
  chama: Chama;
  role: ChamaRole;
  members: number;
  balanceMinor: number;
}

export function listChamasFor(memberKey: string): ChamaSummary[] {
  const rows = db()
    .prepare(
      `${CHAMA_SELECT}
         JOIN chama_members m ON m.chama_id = c.id AND m.member_key = ? AND m.status = 'active'
        ORDER BY c.created_at DESC`,
    )
    .all(memberKey) as Row[];
  return rows.map((r) => {
    const chama = toChama(r);
    return {
      chama,
      role: getMember(chama.id, memberKey)!.role,
      members: listMembers(chama.id).length,
      balanceMinor: groupBalance(chama.id),
    };
  });
}

/** Every chama on the platform — for OEPRC compliance staff, read-only. */
export function listAllChamas(): Omit<ChamaSummary, "role">[] {
  return (db().prepare(`${CHAMA_SELECT} ORDER BY c.created_at DESC`).all() as Row[]).map((r) => {
    const chama = toChama(r);
    return { chama, members: listMembers(chama.id).length, balanceMinor: groupBalance(chama.id) };
  });
}

export function constitutionHistory(chamaId: string): { version: number; body: string; adoptedAt: string; adoptedBy: string }[] {
  return (
    db()
      .prepare(`SELECT * FROM chama_constitutions WHERE chama_id = ? ORDER BY version DESC`)
      .all(chamaId) as Row[]
  ).map((r) => ({
    version: r.version as number,
    body: r.body as string,
    adoptedAt: r.adopted_at as string,
    adoptedBy: r.adopted_by as string,
  }));
}

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

export interface LedgerEntry {
  id: number;
  memberKey: string;
  kind: string;
  direction: "in" | "out";
  amountMinor: number;
  rail: string;
  reference: string;
  loanId: string | null;
  recordedBy: string;
  confirmedBy: string;
  at: string;
}

const toEntry = (r: Row): LedgerEntry => ({
  id: r.id as number,
  memberKey: r.member_key as string,
  kind: r.kind as string,
  direction: r.direction as LedgerEntry["direction"],
  amountMinor: r.amount_minor as number,
  rail: r.rail as string,
  reference: r.reference as string,
  loanId: (r.loan_id as string) ?? null,
  recordedBy: r.recorded_by as string,
  confirmedBy: r.confirmed_by as string,
  at: r.at as string,
});

export function ledger(chamaId: string, memberKey?: string, limit = 200): LedgerEntry[] {
  // Statements ask for everything; screens ask for the most recent page.
  const rows = memberKey
    ? db()
        .prepare(`SELECT * FROM chama_ledger WHERE chama_id = ? AND member_key = ? ORDER BY at DESC, id DESC LIMIT ?`)
        .all(chamaId, memberKey, limit)
    : db().prepare(`SELECT * FROM chama_ledger WHERE chama_id = ? ORDER BY at DESC, id DESC LIMIT ?`).all(chamaId, limit);
  return (rows as Row[]).map(toEntry);
}

/** Cash the group's book says it holds: every confirmed in, less every confirmed out. */
export function groupBalance(chamaId: string): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount_minor ELSE -amount_minor END), 0) AS b
         FROM chama_ledger WHERE chama_id = ?`,
    )
    .get(chamaId) as Row;
  return row.b as number;
}

function sumsByKind(chamaId: string, memberKey: string): Record<string, number> {
  const rows = db()
    .prepare(
      `SELECT kind, SUM(amount_minor) AS total FROM chama_ledger
        WHERE chama_id = ? AND member_key = ? GROUP BY kind`,
    )
    .all(chamaId, memberKey) as Row[];
  return Object.fromEntries(rows.map((r) => [r.kind as string, r.total as number]));
}

/* ------------------------------------------------------------------ *
 * Creating and joining
 * ------------------------------------------------------------------ */

export interface NewChama {
  name: string;
  description: string;
  category: ChamaCategoryKey;
  country: string;
  currency: string;
  visibility: "private" | "public";
  minMembers: number;
  maxMembers: number;
  entryFeeMinor: number;
  contributionMinor: number;
  frequency: Frequency;
  anchorDate: string;
  graceDays: number;
  lateFeeMinor: number;
  approvalsRequired: number;
  reserveBps: number;
  loanRateBps: number;
  loanMultipleTenths: number;
  quorumBps: number;
  thresholdBps: number;
  savingsTargetMinor?: number;
  targetDate?: string | null;
}

function inviteCode(): string {
  // No 0/O or 1/I: these get read aloud at meetings and typed into phones.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function now(): string {
  return new Date().toISOString();
}

function audit(who: ChamaWho, chama: { id: string; name: string }, action: string, summary: string, detail?: Record<string, unknown>) {
  record({
    actor: who.actor,
    action: `chama.${action}`,
    subjectKind: "chama",
    subjectId: chama.id,
    subjectLabel: chama.name,
    summary,
    detail,
    companyId: null,
  });
}

export function createChama(input: NewChama, founder: ChamaWho, today = nairobiDate()): Chama {
  if (input.approvalsRequired < 2) throw new ChamaError("At least two officers must sign before money leaves the group.");
  if (input.maxMembers < input.minMembers) throw new ChamaError("The maximum membership is below the minimum.");
  if (input.approvalsRequired > input.maxMembers - 1) {
    throw new ChamaError("There would never be enough officers to sign. Lower the signatures needed or raise the membership.");
  }
  if (input.anchorDate < today) throw new ChamaError("The first contribution date can't be in the past.");
  if (input.targetDate && input.targetDate <= input.anchorDate) throw new ChamaError("The target date has to come after the first contribution.");
  if (input.quorumBps < 1 || input.quorumBps > 10_000) throw new ChamaError("Quorum must be between 1% and 100%.");
  if (input.thresholdBps <= 5000 || input.thresholdBps > 10_000) throw new ChamaError("A vote must need more than half to carry.");
  categoryFor(input.category);

  const id = `chm_${crypto.randomUUID().slice(0, 10)}`;
  const body = constitutionTemplate({ ...input, name: input.name, anchor: input.anchorDate });

  tx((conn) => {
    conn
      .prepare(
        `INSERT INTO chamas (id, name, description, category, country, currency, visibility, invite_code,
           min_members, max_members, entry_fee_minor, contribution_minor, frequency, anchor_date,
           grace_days, late_fee_minor, approvals_required, reserve_bps, loan_rate_bps,
           loan_multiple_tenths, quorum_bps, threshold_bps, savings_target_minor, target_date,
           status, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'forming',?,?)`,
      )
      .run(
        id, input.name, input.description, input.category, input.country, input.currency,
        input.visibility, inviteCode(), input.minMembers, input.maxMembers, input.entryFeeMinor,
        input.contributionMinor, input.frequency, input.anchorDate, input.graceDays,
        input.lateFeeMinor, input.approvalsRequired, input.reserveBps, input.loanRateBps,
        input.loanMultipleTenths, input.quorumBps, input.thresholdBps,
        input.savingsTargetMinor ?? 0, input.targetDate ?? null, founder.key, now(),
      );
    conn
      .prepare(`INSERT INTO chama_constitutions (chama_id, version, body, adopted_at, adopted_by) VALUES (?, 1, ?, ?, ?)`)
      .run(id, body, now(), founder.key);
    conn
      .prepare(
        `INSERT INTO chama_members (chama_id, member_key, name, role, joined_on, payout_position, acknowledged_version)
         VALUES (?, ?, ?, 'chairperson', ?, 1, 1)`,
      )
      .run(id, founder.key, founder.name, today);
  });

  const chama = getChama(id)!;
  audit(founder, chama, "create", `${founder.name} founded ${chama.name}`, { category: input.category });
  return chama;
}

/**
 * Joining means accepting the constitution as it stands. The version the
 * member saw is passed back in, so someone who read version 2 is not signed up
 * to a version 3 adopted while the page was open.
 */
export function joinChama(code: string, who: ChamaWho, acceptedVersion: number, today = nairobiDate()): Chama {
  const chama = getChamaByInvite(code);
  if (!chama || chama.status === "dissolved" || chama.status === "dissolving") {
    throw new ChamaError("That invitation code doesn't match an open chama.");
  }
  if (acceptedVersion !== chama.constitutionVersion) {
    throw new ChamaError("The constitution changed while you were reading it. Read the current version and accept again.");
  }

  tx((conn) => {
    const existing = getMember(chama.id, who.key);
    if (existing?.status === "active") throw new ChamaError(`You're already a member of ${chama.name}.`);
    if (existing) throw new ChamaError("You've left this chama. Ask the chairperson to readmit you.");

    const count = listMembers(chama.id).length;
    if (count >= chama.maxMembers) throw new ChamaError(`${chama.name} is full at ${chama.maxMembers} members.`);

    const next = (conn.prepare(`SELECT COALESCE(MAX(payout_position), 0) + 1 AS p FROM chama_members WHERE chama_id = ?`).get(chama.id) as Row).p as number;
    conn
      .prepare(
        `INSERT INTO chama_members (chama_id, member_key, name, role, joined_on, payout_position, acknowledged_version)
         VALUES (?, ?, ?, 'member', ?, ?, ?)`,
      )
      .run(chama.id, who.key, who.name, today, next, acceptedVersion);

    if (chama.status === "forming" && count + 1 >= chama.minMembers) {
      conn.prepare(`UPDATE chamas SET status = 'active' WHERE id = ?`).run(chama.id);
    }
  });

  audit(who, chama, "join", `${who.name} joined ${chama.name} and accepted constitution v${acceptedVersion}`);
  return getChama(chama.id)!;
}

export function acknowledgeConstitution(chamaId: string, who: ChamaWho, version: number): void {
  const chama = requireChama(chamaId);
  requireMember(chama, who);
  if (version !== chama.constitutionVersion) throw new ChamaError("That isn't the current constitution.");
  db()
    .prepare(`UPDATE chama_members SET acknowledged_version = ? WHERE chama_id = ? AND member_key = ?`)
    .run(version, chamaId, who.key);
  audit(who, chama, "acknowledge", `${who.name} accepted constitution v${version}`);
}

const ASSIGNABLE: ChamaRole[] = ["treasurer", "secretary", "loan_officer", "auditor", "member"];
const SINGLE_HOLDER: ChamaRole[] = ["treasurer", "secretary"];

export function assignRole(chamaId: string, by: ChamaWho, targetKey: string, role: ChamaRole): void {
  const chama = requireChama(chamaId);
  const me = requireMember(chama, by);
  if (!can(me.role, "assign_roles")) throw new ChamaError("Only the chairperson assigns roles.");
  if (targetKey === by.key) throw new ChamaError("You can't change your own role. Another officer arrangement needs a vote.");
  if (!ASSIGNABLE.includes(role)) throw new ChamaError("The chairperson is chosen by a vote of members, not assigned.");
  const target = getMember(chamaId, targetKey);
  if (!target || target.status !== "active") throw new ChamaError("That person isn't an active member.");
  if (target.role === "chairperson") throw new ChamaError("The chairperson's role changes by vote.");

  tx((conn) => {
    if (SINGLE_HOLDER.includes(role)) {
      conn
        .prepare(`UPDATE chama_members SET role = 'member' WHERE chama_id = ? AND role = ? AND member_key <> ?`)
        .run(chamaId, role, targetKey);
    }
    conn.prepare(`UPDATE chama_members SET role = ? WHERE chama_id = ? AND member_key = ?`).run(role, chamaId, targetKey);
  });
  audit(by, chama, "role", `${by.name} made ${target.name} ${role.replace("_", " ")}`, { from: target.role, to: role });
}

function requireChama(id: string): Chama {
  const chama = getChama(id);
  if (!chama) throw new ChamaError("That chama doesn't exist.");
  if (chama.status === "dissolved") throw new ChamaError("This chama has been dissolved.");
  return chama;
}

/** New money in or out is closed once members have voted to dissolve. */
function requireOperating(chama: Chama): void {
  if (chama.status === "dissolving") {
    throw new ChamaError("Members voted to dissolve this chama. Only loan repayments and the final distribution are taken now.");
  }
}

function requireMember(chama: Chama, who: ChamaWho): Member {
  const member = getMember(chama.id, who.key);
  if (!member || member.status !== "active") throw new ChamaError(`You aren't a member of ${chama.name}.`);
  return member;
}

function requirePermission(member: Member, permission: ChamaPermission, message: string): void {
  if (!can(member.role, permission)) throw new ChamaError(message);
}

function requireCurrentRules(chama: Chama, member: Member): void {
  if (member.acknowledgedVersion < chama.constitutionVersion) {
    throw new ChamaError(`Accept constitution v${chama.constitutionVersion} before you sign for the group.`);
  }
}

/* ------------------------------------------------------------------ *
 * Money in — recorded by one person, confirmed by another officer
 * ------------------------------------------------------------------ */

export type ReceiptKind = "contribution" | "entry_fee" | "late_fee" | "loan_repayment";

export interface NewReceipt {
  memberKey: string;
  kind: ReceiptKind;
  amountMinor: number;
  rail: Rail;
  reference: string;
  loanId?: string | null;
}

export function submitReceipt(chamaId: string, who: ChamaWho, input: NewReceipt): string {
  const chama = requireChama(chamaId);
  const me = requireMember(chama, who);
  if (input.memberKey !== who.key) {
    requirePermission(me, "confirm_receipt", "Only the treasurer or chairperson can record a payment for someone else.");
  }
  if (input.kind !== "loan_repayment") requireOperating(chama);
  const payer = getMember(chamaId, input.memberKey);
  if (!payer || payer.status !== "active") throw new ChamaError("That person isn't an active member.");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new ChamaError("Enter an amount above zero.");
  const reference = normaliseReference(input.rail, input.reference);
  if (!reference) {
    throw new ChamaError(input.rail === "mpesa" ? "An M-Pesa code is 10 letters and numbers." : "Enter the payment reference.");
  }

  if (input.kind === "loan_repayment") {
    const loan = input.loanId ? getRequest(input.loanId) : null;
    if (!loan || loan.chamaId !== chamaId || loan.kind !== "loan" || loan.status !== "executed" || loan.beneficiary !== input.memberKey) {
      throw new ChamaError("Choose the loan this repayment is for.");
    }
    const outstanding = loanPosition(loan).outstandingMinor;
    if (input.amountMinor > outstanding) throw new ChamaError("That's more than is left on the loan.");
  }

  const id = `rct_${crypto.randomUUID().slice(0, 12)}`;
  try {
    db()
      .prepare(
        `INSERT INTO chama_receipts (id, chama_id, member_key, kind, amount_minor, rail, reference, loan_id, submitted_by, submitted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, chamaId, input.memberKey, input.kind, input.amountMinor, input.rail, reference, input.loanId ?? null, who.key, now());
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ChamaError(`${reference} has already been recorded in this chama.`);
    throw err;
  }
  return id;
}

export interface Receipt {
  id: string;
  memberKey: string;
  kind: ReceiptKind;
  amountMinor: number;
  rail: Rail;
  reference: string;
  loanId: string | null;
  submittedBy: string;
  submittedAt: string;
  status: "pending" | "confirmed" | "rejected";
  decidedBy: string | null;
  note: string | null;
}

const toReceipt = (r: Row): Receipt => ({
  id: r.id as string,
  memberKey: r.member_key as string,
  kind: r.kind as ReceiptKind,
  amountMinor: r.amount_minor as number,
  rail: r.rail as Rail,
  reference: r.reference as string,
  loanId: (r.loan_id as string) ?? null,
  submittedBy: r.submitted_by as string,
  submittedAt: r.submitted_at as string,
  status: r.status as Receipt["status"],
  decidedBy: (r.decided_by as string) ?? null,
  note: (r.note as string) ?? null,
});

export function listReceipts(chamaId: string, opts: { status?: Receipt["status"]; memberKey?: string } = {}): Receipt[] {
  const clauses = ["chama_id = ?"];
  const params: unknown[] = [chamaId];
  if (opts.status) {
    clauses.push("status = ?");
    params.push(opts.status);
  }
  if (opts.memberKey) {
    clauses.push("member_key = ?");
    params.push(opts.memberKey);
  }
  return (
    db().prepare(`SELECT * FROM chama_receipts WHERE ${clauses.join(" AND ")} ORDER BY submitted_at DESC LIMIT 100`).all(...params) as Row[]
  ).map(toReceipt);
}

/** Whether `who` may confirm a given receipt — not their own, not one they entered. */
export function canConfirmReceipt(member: Member, receipt: Receipt): boolean {
  return (
    can(member.role, "confirm_receipt") &&
    receipt.submittedBy !== member.key &&
    receipt.memberKey !== member.key
  );
}

export function decideReceipt(receiptId: string, who: ChamaWho, decision: "confirm" | "reject", note?: string): void {
  const row = db().prepare(`SELECT * FROM chama_receipts WHERE id = ?`).get(receiptId) as Row | undefined;
  if (!row) throw new ChamaError("That payment record doesn't exist.");
  const receipt = toReceipt(row);
  const chama = requireChama(row.chama_id as string);
  const me = requireMember(chama, who);
  requireCurrentRules(chama, me);
  if (receipt.status !== "pending") throw new ChamaError("That payment has already been decided.");
  if (!can(me.role, "confirm_receipt")) throw new ChamaError("Only the treasurer or chairperson confirms payments.");
  if (receipt.submittedBy === who.key) throw new ChamaError("Someone other than the person who entered a payment has to confirm it.");
  if (receipt.memberKey === who.key) throw new ChamaError("Another officer has to confirm your own payment.");
  if (decision === "reject" && !note?.trim()) throw new ChamaError("Say why — the member reads this.");

  tx((conn) => {
    const changed = conn
      .prepare(`UPDATE chama_receipts SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'pending'`)
      .run(decision === "confirm" ? "confirmed" : "rejected", who.key, now(), note?.trim() || null, receiptId);
    if (changed.changes !== 1) throw new ChamaError("That payment has already been decided.");
    if (decision === "confirm") {
      conn
        .prepare(
          `INSERT INTO chama_ledger (chama_id, member_key, kind, direction, amount_minor, rail, reference, source_id, loan_id, recorded_by, confirmed_by, at)
           VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(chama.id, receipt.memberKey, receipt.kind, receipt.amountMinor, receipt.rail, receipt.reference, receipt.id, receipt.loanId, receipt.submittedBy, who.key, now());
    }
  });

  audit(who, chama, `receipt.${decision}`, `${who.name} ${decision === "confirm" ? "confirmed" : "rejected"} ${receipt.kind.replace("_", " ")} ${receipt.reference}`, {
    amountMinor: receipt.amountMinor,
    memberKey: receipt.memberKey,
    note,
  });
}

/* ------------------------------------------------------------------ *
 * Money out — a request, signatures, then a recorded payment
 * ------------------------------------------------------------------ */

export type RequestKind = "payout" | "loan" | "withdrawal" | "welfare" | "exit" | "distribution";

export interface ChamaRequest {
  id: string;
  chamaId: string;
  kind: RequestKind;
  beneficiary: string;
  amountMinor: number;
  reason: string;
  round: number | null;
  loanRateBps: number | null;
  loanMonths: number | null;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "executed" | "withdrawn";
  executedBy: string | null;
  executedAt: string | null;
  rail: Rail | null;
  reference: string | null;
  decisions: { approver: string; decision: "approve" | "reject"; at: string }[];
}

const toRequest = (r: Row): ChamaRequest => ({
  id: r.id as string,
  chamaId: r.chama_id as string,
  kind: r.kind as RequestKind,
  beneficiary: r.beneficiary as string,
  amountMinor: r.amount_minor as number,
  reason: r.reason as string,
  round: (r.round as number) ?? null,
  loanRateBps: (r.loan_rate_bps as number) ?? null,
  loanMonths: (r.loan_months as number) ?? null,
  requestedBy: r.requested_by as string,
  requestedAt: r.requested_at as string,
  status: r.status as ChamaRequest["status"],
  executedBy: (r.executed_by as string) ?? null,
  executedAt: (r.executed_at as string) ?? null,
  rail: (r.rail as Rail) ?? null,
  reference: (r.reference as string) ?? null,
  decisions: (
    db().prepare(`SELECT approver, decision, at FROM chama_approvals WHERE request_id = ? ORDER BY at`).all(r.id) as Row[]
  ).map((d) => ({ approver: d.approver as string, decision: d.decision as "approve" | "reject", at: d.at as string })),
});

export function getRequest(id: string): ChamaRequest | null {
  const row = db().prepare(`SELECT * FROM chama_requests WHERE id = ?`).get(id) as Row | undefined;
  return row ? toRequest(row) : null;
}

export function listRequests(chamaId: string, opts: { status?: ChamaRequest["status"][]; beneficiary?: string; kind?: RequestKind } = {}): ChamaRequest[] {
  const clauses = ["chama_id = ?"];
  const params: unknown[] = [chamaId];
  if (opts.status?.length) {
    clauses.push(`status IN (${opts.status.map(() => "?").join(",")})`);
    params.push(...opts.status);
  }
  if (opts.beneficiary) {
    clauses.push("beneficiary = ?");
    params.push(opts.beneficiary);
  }
  if (opts.kind) {
    clauses.push("kind = ?");
    params.push(opts.kind);
  }
  return (
    db().prepare(`SELECT * FROM chama_requests WHERE ${clauses.join(" AND ")} ORDER BY requested_at DESC LIMIT 100`).all(...params) as Row[]
  ).map(toRequest);
}

/** Members who may sign for a request of this kind. */
export function signatoriesFor(chamaId: string): string[] {
  return listMembers(chamaId)
    .filter((m) => can(m.role, "sign_request"))
    .map((m) => m.key);
}

/** The merry-go-round's next round: rounds already started, whatever state they are in. */
export function nextRound(chamaId: string): number {
  return (
    db()
      .prepare(`SELECT COUNT(*) AS n FROM chama_requests WHERE chama_id = ? AND kind = 'payout' AND status NOT IN ('rejected', 'withdrawn')`)
      .get(chamaId) as Row
  ).n as number;
}

export function payoutOrder(chamaId: string): string[] {
  return listMembers(chamaId).map((m) => m.key);
}

/**
 * Who is paid next, and after them. A merry-go-round pays everyone once per
 * cycle, so the queue is everyone not yet paid this cycle in the agreed order,
 * followed by everyone who has. Working from who has been paid — rather than
 * from the round number — keeps the queue honest when someone leaves or the
 * order is changed mid-cycle: nobody is paid twice and nobody is skipped.
 */
export function payoutQueue(chamaId: string): string[] {
  const order = payoutOrder(chamaId);
  if (order.length === 0) return [];
  const counts = new Map(
    (
      db()
        .prepare(
          `SELECT beneficiary, COUNT(*) AS n FROM chama_requests
            WHERE chama_id = ? AND kind = 'payout' AND status NOT IN ('rejected', 'withdrawn') GROUP BY beneficiary`,
        )
        .all(chamaId) as Row[]
    ).map((r) => [r.beneficiary as string, r.n as number]),
  );
  const count = (k: string) => counts.get(k) ?? 0;
  const min = Math.min(...order.map(count));
  return [...order.filter((k) => count(k) === min), ...order.filter((k) => count(k) > min)];
}

function queueSlots(chama: Chama, limit: number): RotationSlot[] {
  const round = nextRound(chama.id);
  return payoutQueue(chama.id)
    .slice(0, limit)
    .map((memberKey, i) => ({
      round: round + i,
      memberKey,
      dueOn: rotationSchedule([memberKey], chama.anchorDate, chama.frequency, round + i, 1)[0].dueOn,
    }));
}

export interface LoanPosition {
  loan: ChamaRequest;
  schedule: Installment[];
  totalMinor: number;
  repaidMinor: number;
  outstandingMinor: number;
  nextInstallment: Installment | null;
}

export function loanPosition(loan: ChamaRequest): LoanPosition {
  const startOn = (loan.executedAt ?? loan.requestedAt).slice(0, 10);
  const terms = { principalMinor: loan.amountMinor, monthlyRateBps: loan.loanRateBps ?? 0, months: loan.loanMonths ?? 1, startOn };
  const schedule = loanSchedule(terms);
  const totalMinor = loanTotal(terms);
  const repaidMinor = (
    db()
      .prepare(`SELECT COALESCE(SUM(amount_minor), 0) AS s FROM chama_ledger WHERE loan_id = ? AND kind = 'loan_repayment'`)
      .get(loan.id) as Row
  ).s as number;
  let running = 0;
  const nextInstallment = schedule.find((i) => (running += i.totalMinor) > repaidMinor) ?? null;
  return { loan, schedule, totalMinor, repaidMinor, outstandingMinor: Math.max(0, totalMinor - repaidMinor), nextInstallment };
}

export function memberLoans(chamaId: string, memberKey: string): LoanPosition[] {
  return listRequests(chamaId, { kind: "loan", beneficiary: memberKey, status: ["executed"] }).map(loanPosition);
}

/** Savings a member holds in the group — only for categories that keep savings. */
function memberSavings(chama: Chama, memberKey: string): number {
  if (!categoryFor(chama.category).features.savings) return 0;
  const s = sumsByKind(chama.id, memberKey);
  return (s.contribution ?? 0) - (s.withdrawal ?? 0) - (s.exit_refund ?? 0);
}

/** The pool not held back as the emergency reserve. */
export function groupAvailable(chama: Chama): { balanceMinor: number; reserveMinor: number; availableMinor: number } {
  const balanceMinor = groupBalance(chama.id);
  const reserveMinor = reserveFor(balanceMinor, chama.reserveBps);
  return { balanceMinor, reserveMinor, availableMinor: Math.max(0, balanceMinor - reserveMinor) };
}

/** What a member could take out today: savings less the reserve share and any loan owed. */
export function memberAvailable(chama: Chama, memberKey: string): { savingsMinor: number; restrictedMinor: number; owedMinor: number; availableMinor: number } {
  const savingsMinor = memberSavings(chama, memberKey);
  const restrictedMinor = reserveFor(savingsMinor, chama.reserveBps);
  const owedMinor = memberLoans(chama.id, memberKey).reduce((s, l) => s + l.outstandingMinor, 0);
  return { savingsMinor, restrictedMinor, owedMinor, availableMinor: Math.max(0, savingsMinor - restrictedMinor - owedMinor) };
}

export interface NewRequest {
  kind: RequestKind;
  /** Ignored for payouts, which go to whoever's turn it is, and for loans and withdrawals, which are your own. */
  beneficiary?: string;
  amountMinor?: number;
  reason: string;
  loanMonths?: number;
}

export function createRequest(chamaId: string, who: ChamaWho, input: NewRequest): ChamaRequest {
  const chama = requireChama(chamaId);
  const me = requireMember(chama, who);
  const features = categoryFor(chama.category).features;
  requireOperating(chama);
  if (input.kind === "exit" || input.kind === "distribution") {
    throw new ChamaError("Leaving and the final distribution have their own steps.");
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new ChamaError("Give a reason the officers can read.");

  let beneficiary = who.key;
  let amount = input.amountMinor ?? 0;
  let round: number | null = null;
  let months: number | null = null;
  let rate: number | null = null;

  if (input.kind === "payout") {
    if (!features.rotation) throw new ChamaError("This chama doesn't rotate a pot.");
    requirePermission(me, "start_payout", "Only the treasurer or chairperson starts a round's payout.");
    const queue = payoutQueue(chamaId);
    round = nextRound(chamaId);
    beneficiary = queue[0];
    amount = potSize(chama.contributionMinor, queue.length);
  } else if (input.kind === "loan") {
    if (!features.lending) throw new ChamaError("This chama doesn't lend.");
    months = input.loanMonths ?? 0;
    rate = chama.loanRateBps;
    if (!Number.isInteger(months) || months < 1 || months > 36) throw new ChamaError("Choose a term between 1 and 36 months.");
    if (memberLoans(chamaId, who.key).some((l) => l.outstandingMinor > 0)) {
      throw new ChamaError("Clear your current loan before taking another.");
    }
    if (listRequests(chamaId, { kind: "loan", beneficiary: who.key, status: ["pending", "approved"] }).length) {
      throw new ChamaError("You already have a loan request waiting.");
    }
    const limit = loanLimit(memberSavings(chama, who.key), chama.loanMultipleTenths, groupAvailable(chama).availableMinor);
    if (amount > limit) throw new ChamaError(`You can borrow up to ${formatMoney(limit, chama.currency)} right now.`);
  } else if (input.kind === "withdrawal") {
    if (!features.withdrawals) throw new ChamaError("This chama's rules don't allow withdrawals.");
    const { availableMinor } = memberAvailable(chama, who.key);
    if (amount > availableMinor) throw new ChamaError("That's more than your available savings.");
  } else if (input.kind === "welfare") {
    if (!features.welfare) throw new ChamaError("This chama doesn't run a welfare fund.");
    beneficiary = input.beneficiary ?? who.key;
    const target = getMember(chamaId, beneficiary);
    if (!target || target.status !== "active") throw new ChamaError("Choose a member to support.");
  }

  if (!Number.isInteger(amount) || amount <= 0) throw new ChamaError("Enter an amount above zero.");

  const signers = { required: chama.approvalsRequired, requestedBy: who.key, beneficiary, signatories: signatoriesFor(chamaId) };
  if (!approvalPossible(signers)) {
    throw new ChamaError(
      `This needs ${chama.approvalsRequired} officers other than you and the recipient to sign, and the group doesn't have that many yet. The chairperson can appoint more.`,
    );
  }

  const id = `req_${crypto.randomUUID().slice(0, 12)}`;
  try {
    db()
      .prepare(
        `INSERT INTO chama_requests (id, chama_id, kind, beneficiary, amount_minor, reason, round, loan_rate_bps, loan_months, requested_by, requested_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, chamaId, input.kind, beneficiary, amount, reason, round, rate, months, who.key, now());
  } catch (err) {
    if (String(err).includes("UNIQUE")) throw new ChamaError("That round's payout has already been started.");
    throw err;
  }
  audit(who, chama, `request.${input.kind}`, `${who.name} asked for a ${input.kind} of ${formatMoney(amount, chama.currency)}`, { requestId: id, beneficiary });
  return getRequest(id)!;
}

export function decideRequest(requestId: string, who: ChamaWho, decision: "approve" | "reject"): ChamaRequest {
  const request = getRequest(requestId);
  if (!request) throw new ChamaError("That request doesn't exist.");
  const chama = requireChama(request.chamaId);
  const me = requireMember(chama, who);
  requireCurrentRules(chama, me);
  if (request.status !== "pending") throw new ChamaError("That request is no longer waiting for signatures.");
  const signers = { required: chama.approvalsRequired, requestedBy: request.requestedBy, beneficiary: request.beneficiary, signatories: signatoriesFor(chama.id) };
  if (!canSign(signers, who.key)) {
    throw new ChamaError(
      who.key === request.requestedBy || who.key === request.beneficiary
        ? "You can't sign for a request you made or money you'd receive."
        : "Only officers sign for the group's money.",
    );
  }

  tx((conn) => {
    try {
      conn.prepare(`INSERT INTO chama_approvals (request_id, approver, decision, at) VALUES (?, ?, ?, ?)`).run(requestId, who.key, decision, now());
    } catch (err) {
      if (String(err).includes("UNIQUE") || String(err).includes("PRIMARY")) throw new ChamaError("You've already signed this.");
      throw err;
    }
    const decisions = conn.prepare(`SELECT approver, decision FROM chama_approvals WHERE request_id = ?`).all(requestId) as { approver: string; decision: "approve" | "reject" }[];
    const state = approvalState({ ...signers, decisions });
    if (state.state !== "pending") {
      conn.prepare(`UPDATE chama_requests SET status = ? WHERE id = ? AND status = 'pending'`).run(state.state, requestId);
    }
  });

  audit(who, chama, `request.${decision}`, `${who.name} ${decision === "approve" ? "signed" : "refused"} a ${request.kind} request`, { requestId });
  return getRequest(requestId)!;
}

/**
 * Records that the approved money has actually been sent.
 *
 * The treasurer pays on the rail — M-Pesa B2C, a bank transfer, cash at a
 * meeting — and enters the reference it produced. The ledger row carries the
 * treasurer as recorder and a signatory as confirmer, so it still took two
 * people.
 */
/**
 * Who records an approved payment as sent: the treasurer — except when the
 * money is going to the treasurer, when the chairperson does it. Without that
 * exception a treasurer's own withdrawal or final share could never be paid.
 */
export function mayExecute(chamaId: string, me: Member, request: Pick<ChamaRequest, "beneficiary">): boolean {
  if (request.beneficiary === me.key) return false;
  if (can(me.role, "execute_request")) return true;
  return me.role === "chairperson" && getMember(chamaId, request.beneficiary)?.role === "treasurer";
}

export function executeRequest(requestId: string, who: ChamaWho, rail: Rail, referenceInput: string): ChamaRequest {
  const request = getRequest(requestId);
  if (!request) throw new ChamaError("That request doesn't exist.");
  const chama = requireChama(request.chamaId);
  const me = requireMember(chama, who);
  requireCurrentRules(chama, me);
  if (request.beneficiary === who.key) throw new ChamaError("Another officer has to send money that's coming to you.");
  if (!mayExecute(chama.id, me, request)) throw new ChamaError("Only the treasurer records that money has been sent.");
  if (request.status !== "approved") throw new ChamaError("This hasn't been approved by enough officers yet.");
  const reference = normaliseReference(rail, referenceInput);
  if (!reference) throw new ChamaError(rail === "mpesa" ? "An M-Pesa code is 10 letters and numbers." : "Enter the payment reference.");

  const { balanceMinor, availableMinor } = groupAvailable(chama);
  // Welfare is what the reserve is for, and a leaver or a wind-up takes their
  // share of it; everything else leaves the reserve alone.
  const ceiling = ["welfare", "exit", "distribution"].includes(request.kind) ? balanceMinor : availableMinor;
  if (request.amountMinor > ceiling) {
    throw new ChamaError("The group's confirmed balance doesn't cover this yet. Confirm outstanding contributions first.");
  }

  const confirmer = request.decisions.find((d) => d.decision === "approve" && d.approver !== who.key)?.approver;
  if (!confirmer) throw new ChamaError("No other officer has signed this.");

  const kind =
    request.kind === "loan" ? "loan_disbursement" : request.kind === "exit" ? "exit_refund" : request.kind;
  tx((conn) => {
    const changed = conn
      .prepare(`UPDATE chama_requests SET status = 'executed', executed_by = ?, executed_at = ?, rail = ?, reference = ? WHERE id = ? AND status = 'approved'`)
      .run(who.key, now(), rail, reference, requestId);
    if (changed.changes !== 1) throw new ChamaError("Someone else has already recorded this.");
    conn
      .prepare(
        `INSERT INTO chama_ledger (chama_id, member_key, kind, direction, amount_minor, rail, reference, source_id, loan_id, recorded_by, confirmed_by, at)
         VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(chama.id, request.beneficiary, kind, request.amountMinor, rail, reference, request.id, request.kind === "loan" ? request.id : null, who.key, confirmer, now());
    if (request.kind === "exit") markExited(conn, chama.id, request.beneficiary);
  });
  if (request.kind === "distribution") closeIfSettled(chama.id);

  audit(who, chama, `request.execute`, `${who.name} sent a ${request.kind} of ${formatMoney(request.amountMinor, chama.currency)} (${reference})`, { requestId });
  return getRequest(requestId)!;
}

/* ------------------------------------------------------------------ *
 * Leaving, nominees and winding up
 * ------------------------------------------------------------------ */

type Conn = ReturnType<typeof db>;

function markExited(conn: Conn, chamaId: string, memberKey: string): void {
  conn
    .prepare(
      `UPDATE chama_members SET status = 'exited', role = 'member', payout_position = NULL, exited_on = ?
        WHERE chama_id = ? AND member_key = ?`,
    )
    .run(nairobiDate(), chamaId, memberKey);
}

/** What leaving would mean for a member today. */
export function exitPreview(chama: Chama, memberKey: string): { refundMinor: number; owesMinor: number; blockers: string[] } {
  const member = getMember(chama.id, memberKey);
  const blockers: string[] = [];
  if (member?.role === "chairperson") blockers.push("The chair has to be handed over by a vote first.");
  const owed = memberLoans(chama.id, memberKey).reduce((s, l) => s + l.outstandingMinor, 0);
  if (owed > 0) blockers.push(`Repay the ${formatMoney(owed, chama.currency)} left on your loan.`);
  const open = listRequests(chama.id, { beneficiary: memberKey, status: ["pending", "approved"] });
  if (open.some((r) => r.kind === "exit")) {
    blockers.push("Your request to leave is with the officers. You'll be marked as left once your refund is sent.");
  } else if (open.length) {
    blockers.push("Wait for your open request to be settled or refused.");
  }
  const sums = sumsByKind(chama.id, memberKey);
  const settlement = exitSettlement(categoryFor(chama.category).features, {
    savingsMinor: memberSavings(chama, memberKey),
    contributedMinor: sums.contribution ?? 0,
    receivedMinor: (sums.payout ?? 0) + (sums.exit_refund ?? 0),
  });
  if (settlement.owesMinor > 0) {
    blockers.push(`You've received ${formatMoney(settlement.owesMinor, chama.currency)} more than you've paid in. Contribute that first.`);
  }
  return { ...settlement, blockers };
}

/**
 * A member leaves. With nothing owed to them they leave at once; otherwise a
 * refund request goes to the officers like any other money out, and they are
 * marked as left when the treasurer records it sent.
 */
export function requestExit(chamaId: string, who: ChamaWho, reasonInput: string): ChamaRequest | null {
  const chama = requireChama(chamaId);
  requireMember(chama, who);
  const preview = exitPreview(chama, who.key);
  if (preview.blockers.length) throw new ChamaError(preview.blockers[0]);
  const reason = reasonInput.trim() || "Leaving the group";

  if (preview.refundMinor === 0) {
    tx((conn) => markExited(conn, chamaId, who.key));
    audit(who, chama, "exit", `${who.name} left ${chama.name}`);
    return null;
  }

  const signers = { required: chama.approvalsRequired, requestedBy: who.key, beneficiary: who.key, signatories: signatoriesFor(chamaId) };
  if (!approvalPossible(signers)) throw new ChamaError("There aren't enough other officers to sign your refund. The chairperson can appoint more.");
  const id = `req_${crypto.randomUUID().slice(0, 12)}`;
  db()
    .prepare(
      `INSERT INTO chama_requests (id, chama_id, kind, beneficiary, amount_minor, reason, requested_by, requested_at)
       VALUES (?, ?, 'exit', ?, ?, ?, ?, ?)`,
    )
    .run(id, chamaId, who.key, preview.refundMinor, reason, who.key, now());
  audit(who, chama, "request.exit", `${who.name} asked to leave with ${formatMoney(preview.refundMinor, chama.currency)} refunded`, { requestId: id });
  return getRequest(id);
}

export function setNominee(chamaId: string, who: ChamaWho, nominee: { name: string; phone: string; relation: string } | null): void {
  const chama = requireChama(chamaId);
  requireMember(chama, who);
  if (nominee && (nominee.name.trim().length < 2 || nominee.relation.trim().length < 2)) {
    throw new ChamaError("Give the nominee's name and how they're related to you.");
  }
  db()
    .prepare(`UPDATE chama_members SET nominee_name = ?, nominee_phone = ?, nominee_relation = ? WHERE chama_id = ? AND member_key = ?`)
    .run(nominee?.name.trim() ?? null, nominee?.phone.trim() || null, nominee?.relation.trim() ?? null, chamaId, who.key);
  // The nominee's details are personal; the trail records only that they changed.
  audit(who, chama, "nominee", `${who.name} ${nominee ? "updated" : "removed"} their nominated beneficiary`);
}

/** What each member would receive if the balance were paid out today. */
export function distributionPlan(chama: Chama): { key: string; amountMinor: number }[] {
  const members = listMembers(chama.id);
  const features = categoryFor(chama.category).features;
  const weights = members.map((m) => {
    const sums = sumsByKind(chama.id, m.key);
    return {
      key: m.key,
      amountMinor: features.savings
        ? memberSavings(chama, m.key)
        : Math.max(0, (sums.contribution ?? 0) - (sums.payout ?? 0)),
    };
  });
  return distributionShares(Math.max(0, groupBalance(chama.id)), weights);
}

/**
 * Starts paying the balance back out after a vote to dissolve. Loans must be
 * repaid first. One request per member goes to the officers; each still needs
 * signatures from people other than its recipient.
 */
export function startDistribution(chamaId: string, who: ChamaWho): ChamaRequest[] {
  const chama = requireChama(chamaId);
  const me = requireMember(chama, who);
  requirePermission(me, "start_payout", "Only the treasurer or chairperson starts the final distribution.");
  if (chama.status !== "dissolving") throw new ChamaError("Members have to vote to dissolve first.");
  const owed = loansOutstanding(chamaId);
  if (owed > 0) throw new ChamaError(`${formatMoney(owed, chama.currency)} in loans is still to be repaid.`);
  if (listRequests(chamaId, { status: ["pending", "approved"] }).length) throw new ChamaError("Settle or refuse the open requests first.");

  const plan = distributionPlan(chama).filter((s) => s.amountMinor > 0);
  if (plan.length === 0) throw new ChamaError("There's nothing on the books to distribute.");
  const signatories = signatoriesFor(chamaId);
  for (const share of plan) {
    if (!approvalPossible({ required: chama.approvalsRequired, requestedBy: who.key, beneficiary: share.key, signatories })) {
      const name = getMember(chamaId, share.key)?.name ?? "a member";
      throw new ChamaError(`There aren't enough independent officers to sign ${name}'s share. Appoint more before distributing.`);
    }
  }

  const ids: string[] = [];
  tx((conn) => {
    const insert = conn.prepare(
      `INSERT INTO chama_requests (id, chama_id, kind, beneficiary, amount_minor, reason, requested_by, requested_at)
       VALUES (?, ?, 'distribution', ?, ?, 'Final distribution on dissolution', ?, ?)`,
    );
    for (const share of plan) {
      const id = `req_${crypto.randomUUID().slice(0, 12)}`;
      insert.run(id, chamaId, share.key, share.amountMinor, who.key, now());
      ids.push(id);
    }
  });
  audit(who, chama, "distribution", `${who.name} started the final distribution of ${formatMoney(groupBalance(chamaId), chama.currency)}`);
  return ids.map((id) => getRequest(id)!);
}

/** Everything still owed on loans, including by members who have left. */
function loansOutstanding(chamaId: string): number {
  return listRequests(chamaId, { kind: "loan", status: ["executed"] }).reduce((s, l) => s + loanPosition(l).outstandingMinor, 0);
}

/** A dissolving chama closes once its books are at zero and nothing is open. */
function closeIfSettled(chamaId: string): void {
  const chama = getChama(chamaId);
  if (!chama || chama.status !== "dissolving") return;
  if (groupBalance(chamaId) !== 0) return;
  if (listRequests(chamaId, { status: ["pending", "approved"] }).length) return;
  // A loan still owed is money the group is due; closing would write it off.
  if (loansOutstanding(chamaId) > 0) return;
  db().prepare(`UPDATE chamas SET status = 'dissolved' WHERE id = ?`).run(chamaId);
  record({
    actor: { kind: "system", id: "system", name: "Vayliron system" },
    action: "chama.dissolved",
    subjectKind: "chama",
    subjectId: chamaId,
    subjectLabel: chama.name,
    summary: `${chama.name} was dissolved with its books at zero`,
    companyId: null,
  });
}

/** For a dissolving group whose books are already empty, the chair closes it. */
export function closeChama(chamaId: string, who: ChamaWho): void {
  const chama = requireChama(chamaId);
  const me = requireMember(chama, who);
  if (me.role !== "chairperson") throw new ChamaError("Only the chairperson closes the group.");
  if (chama.status !== "dissolving") throw new ChamaError("Members have to vote to dissolve first.");
  if (groupBalance(chamaId) !== 0) throw new ChamaError("The books aren't at zero yet.");
  const owed = loansOutstanding(chamaId);
  if (owed > 0) throw new ChamaError(`${formatMoney(owed, chama.currency)} in loans is still owed to the group. Collect it and distribute it first.`);
  if (listRequests(chamaId, { status: ["pending", "approved"] }).length) throw new ChamaError("Settle or refuse the open requests first.");
  closeIfSettled(chamaId);
}

/* ------------------------------------------------------------------ *
 * Votes and amendments
 * ------------------------------------------------------------------ */

export interface Proposal {
  id: string;
  title: string;
  body: string;
  kind: ProposalKind;
  amendmentBody: string | null;
  /** The candidate for chair, or the proposed payout order. */
  payload: { candidate?: string; order?: string[] } | null;
  createdBy: string;
  createdAt: string;
  closesAt: string;
  status: "open" | "carried" | "defeated" | "no_quorum";
  yes: number;
  no: number;
  abstain: number;
  myVote: string | null;
}

export type ProposalKind = "general" | "amendment" | "chair" | "payout_order" | "dissolution";

export interface NewProposal {
  kind: ProposalKind;
  title: string;
  body: string;
  amendmentBody?: string;
  candidate?: string;
  order?: string[];
  days: number;
}

/**
 * Puts a decision to the members. Four kinds change something when they
 * carry: an amendment adopts a new constitution version, a chair vote hands
 * over the chair, a payout-order vote reorders the merry-go-round, and a
 * dissolution vote starts winding the group up. A general vote just records
 * what the group decided.
 */
export function createProposal(chamaId: string, who: ChamaWho, input: NewProposal): string {
  const chama = requireChama(chamaId);
  requireMember(chama, who);
  if (input.title.trim().length < 3) throw new ChamaError("Give the proposal a title.");
  if (input.days < 1 || input.days > 30) throw new ChamaError("A vote stays open between 1 and 30 days.");

  const amendment = input.kind === "amendment" ? input.amendmentBody?.trim() || null : null;
  let payload: Proposal["payload"] = null;
  if (input.kind === "amendment" && !amendment) throw new ChamaError("Write out the new constitution text.");
  if (input.kind === "chair") {
    const candidate = input.candidate ? getMember(chamaId, input.candidate) : null;
    if (!candidate || candidate.status !== "active") throw new ChamaError("Choose a member to stand for chair.");
    if (candidate.role === "chairperson") throw new ChamaError("They are already the chairperson.");
    payload = { candidate: candidate.key };
  }
  if (input.kind === "payout_order") {
    if (!categoryFor(chama.category).features.rotation) throw new ChamaError("This chama doesn't rotate a pot.");
    if (!input.order || !reorderAllowed(payoutOrder(chamaId), input.order, 0)) {
      throw new ChamaError("The new order has to list every current member exactly once.");
    }
    payload = { order: input.order };
  }
  if (input.kind === "dissolution") {
    requireOperating(chama);
    const open = db().prepare(`SELECT 1 FROM chama_proposals WHERE chama_id = ? AND kind = 'dissolution' AND status = 'open'`).get(chamaId);
    if (open) throw new ChamaError("A vote to dissolve is already open.");
  }

  const id = `prp_${crypto.randomUUID().slice(0, 10)}`;
  const closes = new Date(Date.now() + input.days * 86_400_000).toISOString();
  db()
    .prepare(
      `INSERT INTO chama_proposals (id, chama_id, title, body, kind, amendment_body, payload, created_by, created_at, closes_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, chamaId, input.title.trim(), input.body.trim(), input.kind, amendment, payload ? JSON.stringify(payload) : null, who.key, now(), closes);
  audit(who, chama, "proposal", `${who.name} put "${input.title.trim()}" to a vote`, { proposalId: id });
  return id;
}

export function castVote(proposalId: string, who: ChamaWho, choice: "yes" | "no" | "abstain"): void {
  const row = db().prepare(`SELECT * FROM chama_proposals WHERE id = ?`).get(proposalId) as Row | undefined;
  if (!row) throw new ChamaError("That proposal doesn't exist.");
  const chama = requireChama(row.chama_id as string);
  requireMember(chama, who);
  settleProposals(chama.id);
  const status = (db().prepare(`SELECT status FROM chama_proposals WHERE id = ?`).get(proposalId) as Row).status;
  if (status !== "open") throw new ChamaError("Voting on this has closed.");
  try {
    db().prepare(`INSERT INTO chama_votes (proposal_id, member_key, choice, at) VALUES (?,?,?,?)`).run(proposalId, who.key, choice, now());
  } catch (err) {
    if (String(err).includes("UNIQUE") || String(err).includes("PRIMARY")) throw new ChamaError("You've already voted on this.");
    throw err;
  }
  settleProposals(chama.id);
}

/**
 * Closes any vote whose result can no longer change, or whose time is up. An
 * amendment that carries becomes the next constitution version, and every
 * member is asked to accept it.
 */
export function settleProposals(chamaId: string): void {
  const chama = getChama(chamaId);
  if (!chama) return;
  const eligible = listMembers(chamaId).length;
  const open = db().prepare(`SELECT * FROM chama_proposals WHERE chama_id = ? AND status = 'open'`).all(chamaId) as Row[];
  for (const p of open) {
    const tally = tallyFor(p.id as string, eligible, chama);
    const expired = (p.closes_at as string) <= now();
    if (!expired && !voteSettled(tally)) continue;
    const outcome = voteOutcome(tally);
    tx((conn) => {
      const changed = conn.prepare(`UPDATE chama_proposals SET status = ?, closed_at = ? WHERE id = ? AND status = 'open'`).run(outcome, now(), p.id);
      if (changed.changes !== 1 || outcome !== "carried") return;
      const payload = p.payload ? (JSON.parse(p.payload as string) as Proposal["payload"]) : null;
      if (p.kind === "amendment") {
        const version = ((conn.prepare(`SELECT MAX(version) AS v FROM chama_constitutions WHERE chama_id = ?`).get(chamaId) as Row).v as number) + 1;
        conn
          .prepare(`INSERT INTO chama_constitutions (chama_id, version, body, adopted_at, adopted_by) VALUES (?,?,?,?,?)`)
          .run(chamaId, version, p.amendment_body, now(), `vote:${p.id}`);
      }
      if (p.kind === "chair" && payload?.candidate) {
        const candidate = conn.prepare(`SELECT status FROM chama_members WHERE chama_id = ? AND member_key = ?`).get(chamaId, payload.candidate) as Row | undefined;
        // A candidate who left while the vote was open cannot take the chair.
        if (candidate?.status === "active") {
          conn.prepare(`UPDATE chama_members SET role = 'member' WHERE chama_id = ? AND role = 'chairperson'`).run(chamaId);
          conn.prepare(`UPDATE chama_members SET role = 'chairperson' WHERE chama_id = ? AND member_key = ?`).run(chamaId, payload.candidate);
        }
      }
      if (p.kind === "payout_order" && payload?.order) {
        const current = (conn.prepare(`SELECT member_key FROM chama_members WHERE chama_id = ? AND status = 'active' ORDER BY COALESCE(payout_position, 1e9), joined_on, name`).all(chamaId) as Row[]).map((r) => r.member_key as string);
        // Membership may have changed since the vote opened; only a still-valid order is applied.
        if (reorderAllowed(current, payload.order, 0)) {
          const set = conn.prepare(`UPDATE chama_members SET payout_position = ? WHERE chama_id = ? AND member_key = ?`);
          payload.order.forEach((key, i) => set.run(i + 1, chamaId, key));
        }
      }
      if (p.kind === "dissolution") {
        conn.prepare(`UPDATE chamas SET status = 'dissolving' WHERE id = ? AND status IN ('forming', 'active')`).run(chamaId);
      }
    });
  }
}

function tallyFor(proposalId: string, eligible: number, chama: Chama) {
  const counts = Object.fromEntries(
    (db().prepare(`SELECT choice, COUNT(*) AS n FROM chama_votes WHERE proposal_id = ? GROUP BY choice`).all(proposalId) as Row[]).map((r) => [r.choice, r.n as number]),
  );
  return { yes: counts.yes ?? 0, no: counts.no ?? 0, abstain: counts.abstain ?? 0, eligible, quorumBps: chama.quorumBps, thresholdBps: chama.thresholdBps };
}

export function listProposals(chamaId: string, memberKey: string): Proposal[] {
  settleProposals(chamaId);
  return (db().prepare(`SELECT * FROM chama_proposals WHERE chama_id = ? ORDER BY created_at DESC LIMIT 30`).all(chamaId) as Row[]).map((p) => {
    const counts = Object.fromEntries(
      (db().prepare(`SELECT choice, COUNT(*) AS n FROM chama_votes WHERE proposal_id = ? GROUP BY choice`).all(p.id) as Row[]).map((r) => [r.choice, r.n as number]),
    );
    const mine = db().prepare(`SELECT choice FROM chama_votes WHERE proposal_id = ? AND member_key = ?`).get(p.id, memberKey) as Row | undefined;
    return {
      id: p.id as string,
      title: p.title as string,
      body: p.body as string,
      kind: p.kind as Proposal["kind"],
      amendmentBody: (p.amendment_body as string) ?? null,
      payload: p.payload ? (JSON.parse(p.payload as string) as Proposal["payload"]) : null,
      createdBy: p.created_by as string,
      createdAt: p.created_at as string,
      closesAt: p.closes_at as string,
      status: p.status as Proposal["status"],
      yes: counts.yes ?? 0,
      no: counts.no ?? 0,
      abstain: counts.abstain ?? 0,
      myVote: (mine?.choice as string) ?? null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Announcements
 * ------------------------------------------------------------------ */

export function postAnnouncement(chamaId: string, who: ChamaWho, body: string): void {
  const chama = requireChama(chamaId);
  const me = requireMember(chama, who);
  requirePermission(me, "post_announcement", "Only the chairperson or secretary posts announcements.");
  const text = body.trim();
  if (text.length < 2 || text.length > 2000) throw new ChamaError("Write between 2 and 2,000 characters.");
  db().prepare(`INSERT INTO chama_announcements (chama_id, author_key, author_name, body, at) VALUES (?,?,?,?,?)`).run(chamaId, who.key, who.name, text, now());
}

export function listAnnouncements(chamaId: string, limit = 10): { authorName: string; body: string; at: string }[] {
  return (db().prepare(`SELECT * FROM chama_announcements WHERE chama_id = ? ORDER BY at DESC, id DESC LIMIT ?`).all(chamaId, limit) as Row[]).map((r) => ({
    authorName: r.author_name as string,
    body: r.body as string,
    at: r.at as string,
  }));
}

/* ------------------------------------------------------------------ *
 * Dashboards
 * ------------------------------------------------------------------ */

export interface MemberDashboard {
  chama: Chama;
  member: Member;
  standing: Standing;
  nextDue: string;
  savingsMinor: number;
  restrictedMinor: number;
  availableMinor: number;
  receivedMinor: number;
  loans: (LoanPosition & { overdueMinor: number })[];
  /** Merry-go-round only. Projected, not money in hand. */
  rotation: { roundsAway: number; expectedOn: string; potMinor: number } | null;
  group: { balanceMinor: number; reserveMinor: number; availableMinor: number; members: number };
  target: { targetMinor: number; targetDate: string | null; progressBps: number } | null;
  pendingReceipts: Receipt[];
  openVotes: number;
  needsAcknowledgement: boolean;
  exit: ReturnType<typeof exitPreview>;
}

export function memberStanding(chama: Chama, member: Member, today: string): Standing {
  const sums = sumsByKind(chama.id, member.key);
  return standing({
    anchor: chama.anchorDate,
    frequency: chama.frequency,
    contributionMinor: chama.contributionMinor,
    graceDays: chama.graceDays,
    lateFeeMinor: chama.lateFeeMinor,
    // A member who has left stops accruing at the date they left.
    joinedOn: member.joinedOn,
    today: member.exitedOn && member.exitedOn < today ? member.exitedOn : today,
    paidMinor: sums.contribution ?? 0,
    lateFeesPaidMinor: sums.late_fee ?? 0,
  });
}

function withOverdue(l: LoanPosition, today: string) {
  return { ...l, overdueMinor: loanOverdue(l.schedule, l.repaidMinor, today).overdueMinor };
}

export function memberDashboard(chamaId: string, memberKey: string, today = nairobiDate()): MemberDashboard | null {
  const chama = getChama(chamaId);
  const member = chama ? getMember(chamaId, memberKey) : null;
  if (!chama || !member) return null;

  const features = categoryFor(chama.category).features;
  const sums = sumsByKind(chamaId, memberKey);
  const mine = memberAvailable(chama, memberKey);
  const group = groupAvailable(chama);
  const queue = payoutQueue(chamaId);

  let rotation: MemberDashboard["rotation"] = null;
  if (features.rotation && member.status === "active" && chama.status !== "dissolving") {
    const away = queue.indexOf(memberKey);
    if (away >= 0) {
      const slot = queueSlots(chama, away + 1)[away];
      rotation = { roundsAway: away, expectedOn: slot.dueOn, potMinor: potSize(chama.contributionMinor, queue.length) };
    }
  }

  return {
    chama,
    member,
    standing: memberStanding(chama, member, today),
    nextDue: nextDueDate(chama.anchorDate, chama.frequency, today),
    savingsMinor: mine.savingsMinor,
    restrictedMinor: mine.restrictedMinor,
    availableMinor: mine.availableMinor,
    receivedMinor: (sums.payout ?? 0) + (sums.welfare ?? 0),
    loans: memberLoans(chamaId, memberKey).map((l) => withOverdue(l, today)),
    rotation,
    group: { ...group, members: queue.length },
    target:
      chama.savingsTargetMinor > 0
        ? { targetMinor: chama.savingsTargetMinor, targetDate: chama.targetDate, progressBps: targetProgressBps(group.balanceMinor, chama.savingsTargetMinor) }
        : null,
    pendingReceipts: listReceipts(chamaId, { status: "pending", memberKey }),
    openVotes: listProposals(chamaId, memberKey).filter((p) => p.status === "open" && !p.myVote).length,
    needsAcknowledgement: member.acknowledgedVersion < chama.constitutionVersion,
    exit: exitPreview(chama, memberKey),
  };
}

export interface StatementLine {
  kind: string;
  direction: "in" | "out";
  totalMinor: number;
  entries: number;
}

/** The group's income and outflows by kind, from the confirmed ledger. */
export function groupStatement(chamaId: string, from?: string, to?: string): StatementLine[] {
  const clauses = ["chama_id = ?"];
  const params: unknown[] = [chamaId];
  if (from) {
    clauses.push("at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("at < ?");
    params.push(to);
  }
  return (
    db()
      .prepare(
        `SELECT kind, direction, SUM(amount_minor) AS total, COUNT(*) AS n FROM chama_ledger
          WHERE ${clauses.join(" AND ")} GROUP BY kind, direction ORDER BY direction, total DESC`,
      )
      .all(...params) as Row[]
  ).map((r) => ({
    kind: r.kind as string,
    direction: r.direction as "in" | "out",
    totalMinor: r.total as number,
    entries: r.n as number,
  }));
}

export interface GroupDashboard {
  chama: Chama;
  members: (Member & { standing: Standing; savingsMinor: number; owedMinor: number })[];
  balanceMinor: number;
  reserveMinor: number;
  availableMinor: number;
  collectedMinor: number;
  expectedMinor: number;
  arrearsMinor: number;
  loansOutstandingMinor: number;
  loansOverdueMinor: number;
  pendingReceipts: Receipt[];
  openRequests: ChamaRequest[];
  schedule: RotationSlot[];
  periodsElapsed: number;
  /** The most recent contribution periods, newest first. */
  collections: PeriodCollection[];
  statement: StatementLine[];
  loanBook: (LoanPosition & { overdueMinor: number; borrower: string })[];
  upcoming: { on: string; label: string; amountMinor: number }[];
  target: { targetMinor: number; targetDate: string | null; progressBps: number } | null;
  distribution: { key: string; amountMinor: number }[] | null;
  exited: Member[];
}

export function groupDashboard(chamaId: string, today = nairobiDate()): GroupDashboard | null {
  const chama = getChama(chamaId);
  if (!chama) return null;
  const features = categoryFor(chama.category).features;
  const members = listMembers(chamaId).map((m) => {
    const mine = memberAvailable(chama, m.key);
    return { ...m, standing: memberStanding(chama, m, today), savingsMinor: mine.savingsMinor, owedMinor: mine.owedMinor };
  });
  const { balanceMinor, reserveMinor, availableMinor } = groupAvailable(chama);

  const loanBook = members.flatMap((m) =>
    memberLoans(chamaId, m.key)
      .filter((l) => l.outstandingMinor > 0)
      .map((l) => ({ ...withOverdue(l, today), borrower: m.key })),
  );

  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const until = horizon.toISOString().slice(0, 10);
  const upcoming: GroupDashboard["upcoming"] = [];
  if (chama.status !== "dissolving") {
    const nextDue = nextDueDate(chama.anchorDate, chama.frequency, today);
    if (nextDue <= until) {
      upcoming.push({ on: nextDue, label: "Contributions due", amountMinor: chama.contributionMinor * members.length });
    }
  }
  for (const l of loanBook) {
    const next = l.nextInstallment;
    if (next && next.dueOn <= until) {
      upcoming.push({ on: next.dueOn, label: `Loan installment ${next.number} of ${l.schedule.length}`, amountMinor: next.totalMinor });
    }
  }
  upcoming.sort((a, b) => a.on.localeCompare(b.on));

  const collections = collectionsByPeriod(
    chama.anchorDate,
    chama.frequency,
    chama.contributionMinor,
    today,
    members.map((m) => ({ joinedOn: m.joinedOn, paidMinor: m.standing.paidMinor })),
  )
    .slice(-6)
    .reverse();

  return {
    chama,
    members,
    balanceMinor,
    reserveMinor,
    availableMinor,
    collectedMinor: members.reduce((s, m) => s + m.standing.paidMinor, 0),
    expectedMinor: members.reduce((s, m) => s + m.standing.expectedMinor, 0),
    arrearsMinor: members.reduce((s, m) => s + m.standing.arrearsMinor, 0),
    loansOutstandingMinor: members.reduce((s, m) => s + m.owedMinor, 0),
    loansOverdueMinor: loanBook.reduce((s, l) => s + l.overdueMinor, 0),
    pendingReceipts: listReceipts(chamaId, { status: "pending" }),
    openRequests: listRequests(chamaId, { status: ["pending", "approved"] }),
    schedule: features.rotation && chama.status !== "dissolving" ? queueSlots(chama, Math.min(members.length, 12)) : [],
    periodsElapsed: periodsDue(chama.anchorDate, chama.frequency, today),
    collections,
    statement: groupStatement(chamaId),
    loanBook,
    upcoming,
    target:
      chama.savingsTargetMinor > 0
        ? { targetMinor: chama.savingsTargetMinor, targetDate: chama.targetDate, progressBps: targetProgressBps(balanceMinor, chama.savingsTargetMinor) }
        : null,
    distribution: chama.status === "dissolving" ? distributionPlan(chama) : null,
    exited: listMembers(chamaId, true).filter((m) => m.status === "exited"),
  };
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export interface ChamaNotice {
  chamaId: string;
  chamaName: string;
  tone: "brand" | "amber" | "flame" | "sky";
  text: string;
  href: string;
}

/**
 * What needs this person's attention across every chama they belong to.
 *
 * Worked out from the books each time rather than stored, so a notice can
 * never disagree with the ledger: the moment a payment is confirmed, the
 * reminder to pay it is gone.
 */
export function notificationsFor(memberKey: string, today = nairobiDate()): ChamaNotice[] {
  const out: ChamaNotice[] = [];
  const recent = new Date(Date.now() - 14 * 86_400_000).toISOString();
  for (const { chama } of listChamasFor(memberKey)) {
    const view = memberDashboard(chama.id, memberKey, today);
    if (!view) continue;
    const m = (minor: number) => formatMoney(minor, chama.currency);
    const base = { chamaId: chama.id, chamaName: chama.name };
    const mine = `/chama/${chama.id}`;
    const books = `/chama/${chama.id}/books`;

    if (view.needsAcknowledgement) {
      out.push({ ...base, tone: "amber", href: mine, text: `Constitution v${chama.constitutionVersion} was adopted. Read and accept it.` });
    }
    const owed = view.standing.arrearsMinor + view.standing.lateFeesOutstandingMinor;
    if (owed > 0) {
      out.push({ ...base, tone: "flame", href: mine, text: `You're behind by ${m(owed)}.` });
    } else if (chama.status !== "dissolving" && view.standing.creditMinor < chama.contributionMinor) {
      const days = Math.round((Date.parse(`${view.nextDue}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      if (days <= 3) {
        out.push({ ...base, tone: "sky", href: mine, text: `${m(chama.contributionMinor)} contribution due ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}.` });
      }
    }
    for (const l of view.loans) {
      if (l.overdueMinor > 0) out.push({ ...base, tone: "flame", href: mine, text: `${m(l.overdueMinor)} of your loan repayments is overdue.` });
    }
    if (view.openVotes > 0) {
      out.push({ ...base, tone: "brand", href: mine, text: `${view.openVotes} vote${view.openVotes === 1 ? "" : "s"} waiting for you.` });
    }
    for (const r of listReceipts(chama.id, { memberKey, status: "rejected" })) {
      if (r.submittedAt >= recent) out.push({ ...base, tone: "flame", href: mine, text: `Payment ${r.reference} was refused: ${r.note ?? "no reason given"}.` });
    }
    for (const r of listRequests(chama.id, { beneficiary: memberKey, status: ["executed", "rejected"] })) {
      const at = r.executedAt ?? r.requestedAt;
      if (at < recent) continue;
      out.push(
        r.status === "executed"
          ? { ...base, tone: "brand", href: mine, text: `${m(r.amountMinor)} was sent to you (${r.reference}).` }
          : { ...base, tone: "amber", href: mine, text: `Your ${r.kind} request for ${m(r.amountMinor)} was refused.` },
      );
    }
    if (chama.status === "dissolving") {
      out.push({ ...base, tone: "amber", href: mine, text: "Members voted to dissolve. The balance will be paid back out once loans are repaid." });
    }

    // Officer work: only what this person is actually allowed to act on.
    const me = view.member;
    if (can(me.role, "confirm_receipt") && !view.needsAcknowledgement) {
      const waiting = listReceipts(chama.id, { status: "pending" }).filter((r) => canConfirmReceipt(me, r)).length;
      if (waiting) out.push({ ...base, tone: "amber", href: books, text: `${waiting} payment${waiting === 1 ? "" : "s"} to check against the statement.` });
    }
    if (can(me.role, "sign_request") && !view.needsAcknowledgement) {
      const signatories = signatoriesFor(chama.id);
      const toSign = listRequests(chama.id, { status: ["pending"] }).filter(
        (r) =>
          !r.decisions.some((d) => d.approver === memberKey) &&
          canSign({ required: chama.approvalsRequired, requestedBy: r.requestedBy, beneficiary: r.beneficiary, signatories }, memberKey),
      ).length;
      if (toSign) out.push({ ...base, tone: "amber", href: books, text: `${toSign} request${toSign === 1 ? "" : "s"} waiting for your signature.` });
    }
    if (can(me.role, "execute_request") || me.role === "chairperson") {
      const toSend = listRequests(chama.id, { status: ["approved"] }).filter((r) => mayExecute(chama.id, me, r)).length;
      if (toSend) out.push({ ...base, tone: "sky", href: books, text: `${toSend} approved payment${toSend === 1 ? "" : "s"} to send.` });
    }
  }
  return out;
}
