/**
 * Chama — the pure arithmetic behind group savings.
 *
 * Nothing in here touches the database. Every number a member or a treasurer
 * reads — what is owed, what is late, whose turn it is, what a loan costs,
 * whether a vote carried, whether enough officers have signed — comes out of
 * one of these functions, so the test suite can pin all of it down without a
 * ledger.
 *
 * Money is integer minor units of the group's currency (cents for KES, USD,
 * GBP…). Never floats: a shilling lost to rounding in a group of twenty people
 * who all check the books is a dispute.
 */

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export interface ChamaFeatures {
  /** Members take turns receiving the whole pot (merry-go-round). */
  rotation: boolean;
  /** Contributions accumulate as each member's own savings. */
  savings: boolean;
  /** The group lends from its pool to members. */
  lending: boolean;
  /** Members may withdraw their own savings, subject to approval. */
  withdrawals: boolean;
  /** Claims against a shared welfare pot (medical, bereavement, emergency). */
  welfare: boolean;
}

export interface ChamaCategory {
  key: ChamaCategoryKey;
  label: string;
  blurb: string;
  features: ChamaFeatures;
}

const ROTATING: ChamaFeatures = {
  rotation: true,
  savings: false,
  lending: false,
  withdrawals: false,
  welfare: false,
};
const ACCUMULATING: ChamaFeatures = {
  rotation: false,
  savings: true,
  lending: true,
  withdrawals: true,
  welfare: false,
};
const SAVINGS_ONLY: ChamaFeatures = {
  rotation: false,
  savings: true,
  lending: false,
  withdrawals: true,
  welfare: false,
};
const WELFARE: ChamaFeatures = {
  rotation: false,
  savings: false,
  lending: false,
  withdrawals: false,
  welfare: true,
};

export const CHAMA_CATEGORIES = [
  { key: "rosca", label: "Merry-go-round", blurb: "Everyone pays in; one member takes the whole pot each round.", features: ROTATING },
  { key: "asca", label: "Accumulating savings & credit", blurb: "Savings build up and the pool lends to members.", features: ACCUMULATING },
  { key: "table_banking", label: "Table banking", blurb: "Contributions are lent straight back out at each meeting.", features: ACCUMULATING },
  { key: "investment", label: "Investment", blurb: "Pooling towards investments made through a licensed partner.", features: SAVINGS_ONLY },
  { key: "family", label: "Family savings", blurb: "A household or extended family saving together.", features: SAVINGS_ONLY },
  { key: "business", label: "Business development", blurb: "Members lend to each other to grow small businesses.", features: ACCUMULATING },
  { key: "emergency", label: "Emergency assistance", blurb: "A pot members can claim from when something goes wrong.", features: WELFARE },
  { key: "medical", label: "Medical welfare", blurb: "Covers members' hospital bills under agreed rules.", features: WELFARE },
  { key: "education", label: "Education savings", blurb: "Saving towards school fees, with withdrawals for term dates.", features: SAVINGS_ONLY },
  { key: "property", label: "Property acquisition", blurb: "Saving towards land or a building held through a legal vehicle.", features: SAVINGS_ONLY },
  { key: "agricultural", label: "Agricultural", blurb: "Farmers pooling for inputs, equipment and seasonal loans.", features: ACCUMULATING },
  { key: "women", label: "Women's empowerment", blurb: "Savings and lending for a women's group.", features: ACCUMULATING },
  { key: "youth", label: "Youth development", blurb: "Savings and lending for a youth group.", features: ACCUMULATING },
  { key: "community", label: "Religious & community", blurb: "A congregation or community saving and supporting members.", features: { ...SAVINGS_ONLY, welfare: true } },
  { key: "diaspora", label: "Diaspora", blurb: "Members abroad and at home contributing in one currency.", features: SAVINGS_ONLY },
  { key: "retirement", label: "Retirement savings", blurb: "Long-horizon savings with restricted withdrawals.", features: { ...SAVINGS_ONLY, withdrawals: false } },
  { key: "purchasing", label: "Cooperative purchasing", blurb: "Pooling to buy in bulk and share the saving.", features: SAVINGS_ONLY },
  { key: "hybrid", label: "Hybrid", blurb: "A rotation, savings and lending in one group.", features: { rotation: true, savings: true, lending: true, withdrawals: true, welfare: false } },
  { key: "corporate", label: "Corporate employee", blurb: "Colleagues saving and lending through work.", features: ACCUMULATING },
  { key: "custom", label: "Custom", blurb: "Start from savings and lending and write your own rules.", features: ACCUMULATING },
] as const;

export type ChamaCategoryKey = (typeof CHAMA_CATEGORIES)[number]["key"];

export function categoryFor(key: string): ChamaCategory {
  const found = CHAMA_CATEGORIES.find((c) => c.key === key);
  if (!found) throw new RangeError(`unknown chama category: ${key}`);
  return found as ChamaCategory;
}

export function isCategory(key: string): key is ChamaCategoryKey {
  return CHAMA_CATEGORIES.some((c) => c.key === key);
}

/* ------------------------------------------------------------------ *
 * Currency
 * ------------------------------------------------------------------ */

/** Operating currencies, Kenya first. All have two minor digits. */
export const CHAMA_CURRENCIES = ["KES", "UGX", "TZS", "USD", "GBP", "EUR"] as const;
export type ChamaCurrency = (typeof CHAMA_CURRENCIES)[number];

const MINOR_DIGITS: Record<ChamaCurrency, number> = {
  KES: 2,
  UGX: 0,
  TZS: 2,
  USD: 2,
  GBP: 2,
  EUR: 2,
};

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency as ChamaCurrency] ?? 2;
}

/** "1,500" or "1500.50" typed by a person → integer minor units, or null. */
export function parseMoney(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const digits = minorDigits(currency);
  const [whole, fraction = ""] = cleaned.split(".");
  if (fraction.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function formatMoney(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  const value = minor / 10 ** digits;
  const symbol = currency === "KES" ? "KSh" : currency;
  const body = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  return `${minor < 0 ? "−" : ""}${symbol} ${body}`;
}

/* ------------------------------------------------------------------ *
 * The contribution calendar
 * ------------------------------------------------------------------ */

export type Frequency = "weekly" | "fortnightly" | "monthly";

function shiftDate(isoDate: string, frequency: Frequency, steps: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (frequency === "monthly") {
    // Clamp to the month's last day: a group that pays on the 31st pays on
    // the 28th in February, not on the 3rd of March.
    const targetMonth = m - 1 + steps;
    const year = y + Math.floor(targetMonth / 12);
    const month = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
  }
  const days = (frequency === "weekly" ? 7 : 14) * steps;
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The due date of period `index` (0 is the first contribution). */
export function dueDate(anchor: string, frequency: Frequency, index: number): string {
  if (index < 0 || !Number.isInteger(index)) throw new RangeError(`bad period ${index}`);
  return shiftDate(anchor, frequency, index);
}

/** How many contributions have fallen due on or before `today`. */
export function periodsDue(anchor: string, frequency: Frequency, today: string): number {
  if (today < anchor) return 0;
  let count = 0;
  // Bounded: fifty years of weekly contributions.
  while (count < 2600 && dueDate(anchor, frequency, count) <= today) count += 1;
  return count;
}

/** The next due date strictly after `today`, or the anchor if none is due yet. */
export function nextDueDate(anchor: string, frequency: Frequency, today: string): string {
  return dueDate(anchor, frequency, periodsDue(anchor, frequency, today));
}

/** The first period a member who joined on `joinedOn` is liable for. */
export function firstLiablePeriod(anchor: string, frequency: Frequency, joinedOn: string): number {
  // Joining on a due date makes that contribution yours.
  if (joinedOn <= anchor) return 0;
  const before = periodsDue(anchor, frequency, joinedOn);
  return before > 0 && dueDate(anchor, frequency, before - 1) === joinedOn ? before - 1 : before;
}

export interface Standing {
  /** Contributions that have fallen due for this member. */
  periodsLiable: number;
  expectedMinor: number;
  paidMinor: number;
  /** Behind on contributions. Never negative: paying ahead is credit, not arrears. */
  arrearsMinor: number;
  /** Paid ahead of the calendar. */
  creditMinor: number;
  /** Periods that are unpaid and past the grace period. */
  latePeriods: number;
  lateFeesAccruedMinor: number;
  lateFeesOutstandingMinor: number;
}

export interface StandingInput {
  anchor: string;
  frequency: Frequency;
  contributionMinor: number;
  graceDays: number;
  lateFeeMinor: number;
  joinedOn: string;
  today: string;
  paidMinor: number;
  lateFeesPaidMinor: number;
}

/**
 * Where one member stands against the calendar.
 *
 * Payments are applied oldest period first, so a member who pays late clears
 * their oldest arrears before anything newer. A period only counts as late
 * once the grace period has passed and the running total paid still falls
 * short of everything due up to and including it.
 */
export function standing(input: StandingInput): Standing {
  const first = firstLiablePeriod(input.anchor, input.frequency, input.joinedOn);
  const due = periodsDue(input.anchor, input.frequency, input.today);
  const periodsLiable = Math.max(0, due - first);
  const expectedMinor = periodsLiable * input.contributionMinor;

  let latePeriods = 0;
  for (let i = 0; i < periodsLiable; i += 1) {
    const date = dueDate(input.anchor, input.frequency, first + i);
    const graceEnds = new Date(`${date}T00:00:00Z`);
    graceEnds.setUTCDate(graceEnds.getUTCDate() + input.graceDays);
    if (graceEnds.toISOString().slice(0, 10) >= input.today) continue;
    if (input.paidMinor < (i + 1) * input.contributionMinor) latePeriods += 1;
  }

  const lateFeesAccruedMinor = latePeriods * input.lateFeeMinor;
  return {
    periodsLiable,
    expectedMinor,
    paidMinor: input.paidMinor,
    arrearsMinor: Math.max(0, expectedMinor - input.paidMinor),
    creditMinor: Math.max(0, input.paidMinor - expectedMinor),
    latePeriods,
    lateFeesAccruedMinor,
    lateFeesOutstandingMinor: Math.max(0, lateFeesAccruedMinor - input.lateFeesPaidMinor),
  };
}

/* ------------------------------------------------------------------ *
 * Rotation
 * ------------------------------------------------------------------ */

export interface RotationSlot {
  round: number;
  memberKey: string;
  dueOn: string;
}

/**
 * The payout order for a merry-go-round.
 *
 * `order` is the agreed queue — members sorted by their payout position. Round
 * `r` pays the member at `r mod n`, so a group that keeps going after everyone
 * has had a turn simply starts the queue again.
 */
export function rotationSchedule(
  order: string[],
  anchor: string,
  frequency: Frequency,
  fromRound: number,
  count: number,
): RotationSlot[] {
  if (order.length === 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const round = fromRound + i;
    return {
      round,
      memberKey: order[round % order.length],
      dueOn: dueDate(anchor, frequency, round),
    };
  });
}

/**
 * How many rounds until `memberKey` is paid, counting from `currentRound`.
 * 0 means this round is theirs. Null if they are not in the queue.
 */
export function roundsUntilTurn(order: string[], memberKey: string, currentRound: number): number | null {
  const position = order.indexOf(memberKey);
  if (position < 0 || order.length === 0) return null;
  const current = currentRound % order.length;
  return (position - current + order.length) % order.length;
}

/** A full pot: one contribution from every member in the queue. */
export function potSize(contributionMinor: number, members: number): number {
  return contributionMinor * members;
}

/* ------------------------------------------------------------------ *
 * Loans
 * ------------------------------------------------------------------ */

export interface Installment {
  number: number;
  dueOn: string;
  principalMinor: number;
  interestMinor: number;
  totalMinor: number;
}

export interface LoanTerms {
  principalMinor: number;
  /** Flat monthly rate in basis points: 100 = 1% of the principal a month. */
  monthlyRateBps: number;
  months: number;
  /** Date of disbursement; the first installment falls a month later. */
  startOn: string;
}

/**
 * A flat-rate repayment schedule — the way table banking actually charges:
 * interest is a fixed share of the original principal each month.
 *
 * Interest is floored, so a member is never charged a fraction the rules do
 * not support. Both principal and interest are spread evenly with the
 * remainder on the final installment, so the schedule always sums exactly.
 */
export function loanSchedule(terms: LoanTerms): Installment[] {
  const { principalMinor, monthlyRateBps, months } = terms;
  if (!Number.isInteger(principalMinor) || principalMinor <= 0) {
    throw new RangeError("principal must be a positive whole amount");
  }
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new RangeError("a loan runs between 1 and 60 months");
  }
  if (!Number.isInteger(monthlyRateBps) || monthlyRateBps < 0 || monthlyRateBps > 1000) {
    throw new RangeError("monthly rate must be between 0 and 10%");
  }

  const totalInterest = Math.floor((principalMinor * monthlyRateBps * months) / 10_000);
  const principalEach = Math.floor(principalMinor / months);
  const interestEach = Math.floor(totalInterest / months);

  return Array.from({ length: months }, (_, i) => {
    const last = i === months - 1;
    const principal = last ? principalMinor - principalEach * (months - 1) : principalEach;
    const interest = last ? totalInterest - interestEach * (months - 1) : interestEach;
    return {
      number: i + 1,
      dueOn: dueDate(terms.startOn, "monthly", i + 1),
      principalMinor: principal,
      interestMinor: interest,
      totalMinor: principal + interest,
    };
  });
}

export function loanTotal(terms: LoanTerms): number {
  return loanSchedule(terms).reduce((sum, i) => sum + i.totalMinor, 0);
}

/**
 * The most a member may borrow: a multiple of their own savings, and never
 * more than the group actually holds unrestricted.
 */
export function loanLimit(savingsMinor: number, multipleTenths: number, groupAvailableMinor: number): number {
  const bySavings = Math.floor((savingsMinor * multipleTenths) / 10);
  return Math.max(0, Math.min(bySavings, groupAvailableMinor));
}

/* ------------------------------------------------------------------ *
 * Approvals — no one person moves the group's money
 * ------------------------------------------------------------------ */

export interface ApprovalInput {
  required: number;
  requestedBy: string;
  beneficiary: string | null;
  decisions: { approver: string; decision: "approve" | "reject" }[];
  /** Members allowed to sign for this kind of request. */
  signatories: string[];
}

export type ApprovalState =
  | { state: "pending"; approvals: number; needed: number }
  | { state: "approved"; approvals: number }
  | { state: "rejected"; by: string };

/** Who may sign: a signatory who is neither the requester nor the beneficiary. */
export function canSign(input: Omit<ApprovalInput, "decisions">, member: string): boolean {
  return (
    input.signatories.includes(member) &&
    member !== input.requestedBy &&
    member !== input.beneficiary
  );
}

/**
 * Counts only signatures that are allowed to count. A requester's own
 * approval, the beneficiary's, or a non-officer's is ignored rather than
 * trusted, so a mistake in the caller cannot lower the bar. Any one valid
 * rejection stops the request.
 */
export function approvalState(input: ApprovalInput): ApprovalState {
  const seen = new Set<string>();
  let approvals = 0;
  for (const d of input.decisions) {
    if (seen.has(d.approver) || !canSign(input, d.approver)) continue;
    seen.add(d.approver);
    if (d.decision === "reject") return { state: "rejected", by: d.approver };
    approvals += 1;
  }
  const required = Math.max(2, input.required);
  return approvals >= required
    ? { state: "approved", approvals }
    : { state: "pending", approvals, needed: required - approvals };
}

/**
 * Whether a request can ever be approved — there have to be enough eligible
 * signatories left once the requester and beneficiary are set aside.
 */
export function approvalPossible(input: Omit<ApprovalInput, "decisions">): boolean {
  const eligible = new Set(input.signatories.filter((s) => canSign(input, s)));
  return eligible.size >= Math.max(2, input.required);
}

/* ------------------------------------------------------------------ *
 * Votes
 * ------------------------------------------------------------------ */

export interface Tally {
  yes: number;
  no: number;
  abstain: number;
  eligible: number;
  /** Basis points of eligible members who must take part. */
  quorumBps: number;
  /** Basis points of yes among yes + no needed to carry. */
  thresholdBps: number;
}

export type VoteOutcome = "carried" | "defeated" | "no_quorum";

export function voteOutcome(t: Tally): VoteOutcome {
  const turnout = t.yes + t.no + t.abstain;
  if (t.eligible === 0 || turnout * 10_000 < t.quorumBps * t.eligible) return "no_quorum";
  const decided = t.yes + t.no;
  if (decided === 0) return "defeated";
  // Compare the yes share rounded to a basis point: "two thirds" is stored as
  // 6667, and 4 of 6 (6666.67) is exactly two thirds, so it has to carry.
  return Math.round((t.yes * 10_000) / decided) >= t.thresholdBps ? "carried" : "defeated";
}

/**
 * Whether the result can still change. Once the outcome holds whichever way
 * every outstanding member votes, the vote can be closed early.
 */
export function voteSettled(t: Tally): boolean {
  const outstanding = t.eligible - (t.yes + t.no + t.abstain);
  if (outstanding <= 0) return true;
  const allYes = voteOutcome({ ...t, yes: t.yes + outstanding });
  const allNo = voteOutcome({ ...t, no: t.no + outstanding });
  return allYes === allNo;
}

/* ------------------------------------------------------------------ *
 * Reserves
 * ------------------------------------------------------------------ */

/** The share of a balance held back as the emergency reserve. Rounded up. */
export function reserveFor(balanceMinor: number, reserveBps: number): number {
  if (balanceMinor <= 0) return 0;
  return Math.ceil((balanceMinor * reserveBps) / 10_000);
}

/* ------------------------------------------------------------------ *
 * Roles
 * ------------------------------------------------------------------ */

export const CHAMA_ROLES = [
  "chairperson",
  "treasurer",
  "secretary",
  "loan_officer",
  "auditor",
  "member",
] as const;
export type ChamaRole = (typeof CHAMA_ROLES)[number];

export const ROLE_LABEL: Record<ChamaRole, string> = {
  chairperson: "Chairperson",
  treasurer: "Treasurer",
  secretary: "Secretary",
  loan_officer: "Loan officer",
  auditor: "Auditor",
  member: "Member",
};

export type ChamaPermission =
  | "confirm_receipt"
  | "sign_request"
  | "execute_request"
  | "start_payout"
  | "assign_roles"
  | "post_announcement"
  | "view_books";

const PERMISSIONS: Record<ChamaRole, ChamaPermission[]> = {
  chairperson: ["confirm_receipt", "sign_request", "start_payout", "assign_roles", "post_announcement", "view_books"],
  treasurer: ["confirm_receipt", "sign_request", "execute_request", "start_payout", "view_books"],
  secretary: ["sign_request", "post_announcement", "view_books"],
  loan_officer: ["sign_request", "view_books"],
  // An auditor reads everything and signs nothing.
  auditor: ["view_books"],
  member: [],
};

export function can(role: ChamaRole, permission: ChamaPermission): boolean {
  return PERMISSIONS[role].includes(permission);
}

/* ------------------------------------------------------------------ *
 * Constitution
 * ------------------------------------------------------------------ */

export interface ConstitutionRules {
  name: string;
  category: ChamaCategoryKey;
  currency: string;
  contributionMinor: number;
  frequency: Frequency;
  anchor: string;
  graceDays: number;
  lateFeeMinor: number;
  entryFeeMinor: number;
  minMembers: number;
  maxMembers: number;
  approvalsRequired: number;
  reserveBps: number;
  loanRateBps: number;
  loanMultipleTenths: number;
  quorumBps: number;
  thresholdBps: number;
  savingsTargetMinor?: number;
  targetDate?: string | null;
}

const FREQ_LABEL: Record<Frequency, string> = {
  weekly: "every week",
  fortnightly: "every two weeks",
  monthly: "every month",
};

/**
 * A plain-language constitution generated from the group's rules. It is a
 * starting template the members adopt and can amend by vote — not legal
 * advice, and it says so.
 */
export function constitutionTemplate(r: ConstitutionRules): string {
  const cat = categoryFor(r.category);
  const money = (m: number) => formatMoney(m, r.currency);
  const pct = (bps: number) => `${(bps / 100).toLocaleString("en-KE")}%`;
  const lines = [
    `1. Name and purpose. ${r.name} is a ${cat.label.toLowerCase()} group. ${cat.blurb}`,
    `2. Membership. The group has between ${r.minMembers} and ${r.maxMembers} members. A member joins by invitation and by accepting this constitution.${r.entryFeeMinor > 0 ? ` A one-off registration fee of ${money(r.entryFeeMinor)} is payable on joining.` : ""}`,
    `3. Contributions. Each member contributes ${money(r.contributionMinor)} ${FREQ_LABEL[r.frequency]}, first due on ${r.anchor}. Payment is due on the due date, with a grace period of ${r.graceDays} day${r.graceDays === 1 ? "" : "s"}.`,
    r.lateFeeMinor > 0
      ? `4. Late payment. A contribution unpaid after the grace period attracts a late fee of ${money(r.lateFeeMinor)}.`
      : `4. Late payment. No late fee is charged; arrears are reported to the group.`,
    cat.features.rotation
      ? `5. Payouts. Each round, one member receives the full pot in the order agreed by the group. The order is recorded and visible to every member.`
      : `5. Savings. Contributions are held as each member's savings. ${pct(r.reserveBps)} of the group's funds is kept as an emergency reserve.`,
    cat.features.lending
      ? `6. Lending. A member may borrow up to ${(r.loanMultipleTenths / 10).toLocaleString("en-KE")} times their own savings, at a flat ${pct(r.loanRateBps)} a month on the amount borrowed, within the limits of Kenyan law.`
      : `6. Lending. The group does not lend.`,
    (r.savingsTargetMinor ?? 0) > 0
      ? `6a. Target. The group is saving towards ${money(r.savingsTargetMinor ?? 0)}${r.targetDate ? ` by ${r.targetDate}` : ""}.`
      : ``,
    `7. Handling money. No single officer may release group funds. Every payout, loan or withdrawal needs the signatures of ${r.approvalsRequired} officers, none of whom may be the person who asked for it or the person receiving it. Every contribution recorded by one officer is confirmed by another.`,
    `8. Decisions and amendments. Group decisions are made by vote. A vote needs ${pct(r.quorumBps)} of members to take part and ${pct(r.thresholdBps)} of those voting yes or no to carry. This constitution is amended only by such a vote, and each version is kept.`,
    `9. Leaving the group. A member who leaves must first clear any loan. They are then paid their savings — or, in a merry-go-round, what they have paid in and not yet received — once officers approve it. Each member may nominate a beneficiary to receive their share if they die.`,
    `10. Disputes. Disputes go first to the officers, then to a vote of the members, and then to mediation before any court.`,
    `11. Dissolution. The group may dissolve by vote. No new contributions or loans are taken after that vote; loans are repaid, and the balance is returned to members in proportion to their savings, each payment signed by officers as usual.`,
    ``,
    `This template is a starting point, not legal advice. Groups that hold significant funds or invest should register with the Department of Social Development or as a society, and invest only through licensed institutions.`,
  ];
  return lines.filter((l, i) => l !== "" || i === lines.length - 2).join("\n");
}

/* ------------------------------------------------------------------ *
 * Dissolution and exit
 * ------------------------------------------------------------------ */

export interface Share {
  key: string;
  amountMinor: number;
}

/**
 * Splits `totalMinor` in proportion to each member's weight, by largest
 * remainder: every share is floored, then the leftover minor units go one at a
 * time to the biggest fractions. The shares always add back to the total, and
 * nobody gets a unit more than their fraction rounds to. With no weights at
 * all, the pot is split equally.
 */
export function distributionShares(totalMinor: number, weights: Share[]): Share[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) throw new RangeError("total must be a whole amount");
  if (weights.length === 0) return [];
  const clean = weights.map((w) => ({ key: w.key, weight: Math.max(0, w.amountMinor) }));
  const sum = clean.reduce((s, w) => s + w.weight, 0);
  const basis = sum === 0 ? clean.map((w) => ({ ...w, weight: 1 })) : clean;
  const denom = sum === 0 ? clean.length : sum;

  const raw = basis.map((w, i) => {
    const exact = (totalMinor * w.weight) / denom;
    return { key: w.key, floor: Math.floor(exact), frac: exact - Math.floor(exact), i };
  });
  let left = totalMinor - raw.reduce((s, r) => s + r.floor, 0);
  const byFrac = [...raw].sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const r of byFrac) {
    if (left <= 0) break;
    r.floor += 1;
    left -= 1;
  }
  return raw.map((r) => ({ key: r.key, amountMinor: r.floor }));
}

/**
 * What a leaving member is owed.
 *
 * In a savings group, their savings. In a merry-go-round, whatever they have
 * paid in and not yet received back — someone leaving before their turn gets
 * their money back; someone who has already taken the pot owes the group
 * until they have paid in as much as they took.
 */
export function exitSettlement(
  features: ChamaFeatures,
  input: { savingsMinor: number; contributedMinor: number; receivedMinor: number },
): { refundMinor: number; owesMinor: number } {
  if (features.savings) return { refundMinor: Math.max(0, input.savingsMinor), owesMinor: 0 };
  const net = input.contributedMinor - input.receivedMinor;
  return { refundMinor: Math.max(0, net), owesMinor: Math.max(0, -net) };
}

/* ------------------------------------------------------------------ *
 * Changing the payout order
 * ------------------------------------------------------------------ */

/**
 * A new merry-go-round order is acceptable only if it is a reordering of the
 * same people, and nobody already paid in the current cycle moves — otherwise
 * a member could be paid twice in a cycle, or skipped.
 */
export function reorderAllowed(current: string[], proposed: string[], roundsDoneInCycle: number): boolean {
  if (current.length !== proposed.length) return false;
  if (new Set(proposed).size !== proposed.length) return false;
  if (!current.every((k) => proposed.includes(k))) return false;
  for (let i = 0; i < Math.min(roundsDoneInCycle, current.length); i += 1) {
    if (current[i] !== proposed[i]) return false;
  }
  return true;
}

/** Moves `key` to `position` (0-based), shifting everyone between. */
export function moveInOrder(order: string[], key: string, position: number): string[] {
  const without = order.filter((k) => k !== key);
  if (without.length === order.length) return order;
  const at = Math.max(0, Math.min(position, without.length));
  return [...without.slice(0, at), key, ...without.slice(at)];
}

/* ------------------------------------------------------------------ *
 * Collections by period, and overdue loans
 * ------------------------------------------------------------------ */

export interface PeriodCollection {
  index: number;
  dueOn: string;
  liable: number;
  paidUp: number;
}

/**
 * For each contribution period, how many members owed it and how many have
 * covered it. Payments cover periods oldest first, the same rule as `standing`.
 */
export function collectionsByPeriod(
  anchor: string,
  frequency: Frequency,
  contributionMinor: number,
  today: string,
  members: { joinedOn: string; paidMinor: number }[],
): PeriodCollection[] {
  const due = periodsDue(anchor, frequency, today);
  const out: PeriodCollection[] = [];
  for (let index = 0; index < due; index += 1) {
    let liable = 0;
    let paidUp = 0;
    for (const m of members) {
      const first = firstLiablePeriod(anchor, frequency, m.joinedOn);
      if (index < first) continue;
      liable += 1;
      const covered = Math.floor(m.paidMinor / contributionMinor);
      if (index - first < covered) paidUp += 1;
    }
    out.push({ index, dueOn: dueDate(anchor, frequency, index), liable, paidUp });
  }
  return out;
}

/** Installments fallen due by `today` that the repayments so far do not cover. */
export function loanOverdue(schedule: Installment[], repaidMinor: number, today: string): { overdueMinor: number; installments: number } {
  let dueSoFar = 0;
  let installments = 0;
  for (const i of schedule) {
    if (i.dueOn >= today) break;
    dueSoFar += i.totalMinor;
    if (repaidMinor < dueSoFar) installments += 1;
  }
  return { overdueMinor: Math.max(0, dueSoFar - repaidMinor), installments };
}

/** Progress towards a group savings target, in basis points, capped at 100%. */
export function targetProgressBps(balanceMinor: number, targetMinor: number): number {
  if (targetMinor <= 0) return 0;
  return Math.min(10_000, Math.floor((Math.max(0, balanceMinor) * 10_000) / targetMinor));
}
