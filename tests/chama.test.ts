import { describe, expect, it } from "vitest";

import {
  acknowledgeConstitution,
  assignRole,
  castVote,
  ChamaError,
  createChama,
  createProposal,
  createRequest,
  decideReceipt,
  decideRequest,
  executeRequest,
  getChama,
  groupBalance,
  groupDashboard,
  joinChama,
  listProposals,
  memberDashboard,
  notificationsFor,
  payoutQueue,
  requestExit,
  setNominee,
  startDistribution,
  closeChama,
  getMember,
  groupStatement,
  submitReceipt,
  whoFromActor,
  type ChamaWho,
  type NewChama,
} from "@/lib/chama";
import { db } from "@/lib/db";
import {
  approvalPossible,
  approvalState,
  categoryFor,
  CHAMA_CATEGORIES,
  collectionsByPeriod,
  distributionShares,
  exitSettlement,
  loanOverdue,
  moveInOrder,
  reorderAllowed,
  targetProgressBps,
  dueDate,
  firstLiablePeriod,
  formatMoney,
  loanLimit,
  loanSchedule,
  parseMoney,
  periodsDue,
  reserveFor,
  rotationSchedule,
  roundsUntilTurn,
  standing,
  voteOutcome,
  voteSettled,
} from "@/lib/domain/chama";

/* ------------------------------------------------------------------ *
 * Pure rules
 * ------------------------------------------------------------------ */

describe("chama categories", () => {
  it("offers all twenty kinds of group", () => {
    expect(CHAMA_CATEGORIES).toHaveLength(20);
    expect(new Set(CHAMA_CATEGORIES.map((c) => c.key)).size).toBe(20);
  });

  it("never lets a merry-go-round lend or a retirement group withdraw", () => {
    const by = Object.fromEntries(CHAMA_CATEGORIES.map((c) => [c.key, c.features]));
    expect(by.rosca.rotation).toBe(true);
    expect(by.rosca.lending).toBe(false);
    expect(by.retirement.withdrawals).toBe(false);
    expect(by.medical.welfare).toBe(true);
  });
});

describe("money", () => {
  it("reads what people type into whole minor units", () => {
    expect(parseMoney("1,500", "KES")).toBe(150_000);
    expect(parseMoney("1500.5", "KES")).toBe(150_050);
    expect(parseMoney("20000", "UGX")).toBe(20_000);
  });

  it("refuses fractions a currency does not have, and nonsense", () => {
    expect(parseMoney("10.005", "KES")).toBeNull();
    expect(parseMoney("10.5", "UGX")).toBeNull();
    expect(parseMoney("-5", "KES")).toBeNull();
    expect(parseMoney("abc", "KES")).toBeNull();
  });

  it("prints shillings the Kenyan way", () => {
    expect(formatMoney(150_000, "KES")).toBe("KSh 1,500");
    expect(formatMoney(150_050, "KES")).toBe("KSh 1,500.50");
  });
});

describe("the contribution calendar", () => {
  it("steps weekly, fortnightly and monthly", () => {
    expect(dueDate("2026-01-05", "weekly", 2)).toBe("2026-01-19");
    expect(dueDate("2026-01-05", "fortnightly", 1)).toBe("2026-01-19");
    expect(dueDate("2026-01-05", "monthly", 13)).toBe("2027-02-05");
  });

  it("pays on the last day of a short month rather than spilling into the next", () => {
    expect(dueDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(dueDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
  });

  it("counts a contribution as due on its due date", () => {
    expect(periodsDue("2026-03-01", "monthly", "2026-02-28")).toBe(0);
    expect(periodsDue("2026-03-01", "monthly", "2026-03-01")).toBe(1);
    expect(periodsDue("2026-03-01", "monthly", "2026-05-15")).toBe(3);
  });

  it("does not bill a late joiner for rounds before they arrived", () => {
    expect(firstLiablePeriod("2026-01-01", "monthly", "2025-12-20")).toBe(0);
    expect(firstLiablePeriod("2026-01-01", "monthly", "2026-02-10")).toBe(2);
    expect(firstLiablePeriod("2026-01-01", "monthly", "2026-02-01")).toBe(1);
  });
});

describe("where a member stands", () => {
  const base = {
    anchor: "2026-01-01",
    frequency: "monthly" as const,
    contributionMinor: 100_000,
    graceDays: 5,
    lateFeeMinor: 10_000,
    joinedOn: "2026-01-01",
    lateFeesPaidMinor: 0,
  };

  it("is square when paid up", () => {
    const s = standing({ ...base, today: "2026-03-02", paidMinor: 300_000 });
    expect(s.arrearsMinor).toBe(0);
    expect(s.latePeriods).toBe(0);
  });

  it("only calls a period late once its grace has run out", () => {
    const inGrace = standing({ ...base, today: "2026-03-04", paidMinor: 200_000 });
    expect(inGrace.arrearsMinor).toBe(100_000);
    expect(inGrace.latePeriods).toBe(0);
    const late = standing({ ...base, today: "2026-03-07", paidMinor: 200_000 });
    expect(late.latePeriods).toBe(1);
    expect(late.lateFeesOutstandingMinor).toBe(10_000);
  });

  it("treats paying ahead as credit, never negative arrears", () => {
    const s = standing({ ...base, today: "2026-01-02", paidMinor: 300_000 });
    expect(s.arrearsMinor).toBe(0);
    expect(s.creditMinor).toBe(200_000);
  });
});

describe("the merry-go-round", () => {
  const order = ["a", "b", "c"];

  it("pays the queue in order and starts again", () => {
    const slots = rotationSchedule(order, "2026-01-01", "monthly", 0, 4);
    expect(slots.map((s) => s.memberKey)).toEqual(["a", "b", "c", "a"]);
    expect(slots[3].dueOn).toBe("2026-04-01");
  });

  it("knows how far away each member's turn is", () => {
    expect(roundsUntilTurn(order, "a", 1)).toBe(2);
    expect(roundsUntilTurn(order, "b", 1)).toBe(0);
    expect(roundsUntilTurn(order, "z", 1)).toBeNull();
  });
});

describe("loans", () => {
  it("charges a flat monthly rate on the original principal", () => {
    const s = loanSchedule({ principalMinor: 1_200_000, monthlyRateBps: 100, months: 12, startOn: "2026-01-15" });
    expect(s).toHaveLength(12);
    expect(s.reduce((t, i) => t + i.interestMinor, 0)).toBe(144_000);
    expect(s[0].dueOn).toBe("2026-02-15");
  });

  it("always sums exactly, whatever the remainder", () => {
    for (const principal of [1, 7, 99_999, 1_000_003]) {
      for (const months of [1, 3, 7, 11]) {
        const s = loanSchedule({ principalMinor: principal, monthlyRateBps: 150, months, startOn: "2026-01-01" });
        expect(s.reduce((t, i) => t + i.principalMinor, 0)).toBe(principal);
        expect(s.every((i) => i.principalMinor >= 0 && i.interestMinor >= 0)).toBe(true);
      }
    }
  });

  it("caps borrowing at a multiple of savings and at what the group holds", () => {
    expect(loanLimit(100_000, 30, 1_000_000)).toBe(300_000);
    expect(loanLimit(100_000, 30, 200_000)).toBe(200_000);
    expect(loanLimit(0, 30, 1_000_000)).toBe(0);
  });

  it("refuses terms the rules cannot carry", () => {
    expect(() => loanSchedule({ principalMinor: 0, monthlyRateBps: 100, months: 3, startOn: "2026-01-01" })).toThrow(RangeError);
    expect(() => loanSchedule({ principalMinor: 100, monthlyRateBps: 2000, months: 3, startOn: "2026-01-01" })).toThrow(RangeError);
  });
});

describe("signatures", () => {
  const base = { required: 2, requestedBy: "chair", beneficiary: "bob", signatories: ["chair", "treasurer", "secretary", "bob"] };

  it("needs two signatures other than the requester's and the recipient's", () => {
    const state = approvalState({
      ...base,
      decisions: [
        { approver: "chair", decision: "approve" },
        { approver: "bob", decision: "approve" },
        { approver: "treasurer", decision: "approve" },
      ],
    });
    expect(state).toEqual({ state: "pending", approvals: 1, needed: 1 });
  });

  it("carries with two valid signatures and stops at any valid refusal", () => {
    expect(approvalState({ ...base, decisions: [{ approver: "treasurer", decision: "approve" }, { approver: "secretary", decision: "approve" }] }).state).toBe("approved");
    expect(approvalState({ ...base, decisions: [{ approver: "treasurer", decision: "reject" }] }).state).toBe("rejected");
  });

  it("never accepts fewer than two, even if the group asked for one", () => {
    expect(approvalState({ ...base, required: 1, decisions: [{ approver: "treasurer", decision: "approve" }] }).state).toBe("pending");
  });

  it("knows when a group simply has too few officers", () => {
    expect(approvalPossible({ ...base, signatories: ["chair", "treasurer", "bob"] })).toBe(false);
  });
});

describe("votes", () => {
  const t = { yes: 0, no: 0, abstain: 0, eligible: 10, quorumBps: 5000, thresholdBps: 6667 };

  it("needs a quorum before anything carries", () => {
    expect(voteOutcome({ ...t, yes: 4 })).toBe("no_quorum");
    expect(voteOutcome({ ...t, yes: 5 })).toBe("carried");
  });

  it("needs two thirds of those deciding", () => {
    expect(voteOutcome({ ...t, yes: 4, no: 2 })).toBe("carried");
    expect(voteOutcome({ ...t, yes: 3, no: 2 })).toBe("defeated");
  });

  it("closes early once the outstanding votes can't change the result", () => {
    expect(voteSettled({ ...t, yes: 7 })).toBe(true);
    expect(voteSettled({ ...t, yes: 3 })).toBe(false);
  });
});

describe("the reserve", () => {
  it("rounds up so the reserve is never short", () => {
    expect(reserveFor(1001, 1000)).toBe(101);
    expect(reserveFor(0, 1000)).toBe(0);
    expect(reserveFor(-50, 1000)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * The book, against a real database
 * ------------------------------------------------------------------ */

const person = (id: string, name: string): ChamaWho =>
  whoFromActor({ kind: "employee", id, name, companyId: "co_secret" });

const amina = person("emp_amina", "Amina Wanjiru");
const brian = person("emp_brian", "Brian Otieno");
const chebet = person("emp_chebet", "Chebet Kiprop");
const dan = person("emp_dan", "Dan Mwangi");

const RULES = (over: Partial<NewChama> = {}): NewChama => ({
  name: "Upper Hill Wednesday Group",
  description: "",
  category: "asca",
  country: "KE",
  currency: "KES",
  visibility: "private",
  minMembers: 3,
  maxMembers: 10,
  entryFeeMinor: 0,
  contributionMinor: 100_000,
  frequency: "monthly",
  anchorDate: "2026-01-01",
  graceDays: 3,
  lateFeeMinor: 5_000,
  approvalsRequired: 2,
  reserveBps: 1000,
  loanRateBps: 100,
  loanMultipleTenths: 30,
  quorumBps: 5000,
  thresholdBps: 6667,
  ...over,
});

let mpesa = 0;
const code = () => `SJK${String(++mpesa).padStart(7, "0")}`;

function setUp(over: Partial<NewChama> = {}) {
  const chama = createChama(RULES(over), amina, "2025-12-15");
  for (const who of [brian, chebet, dan]) joinChama(chama.inviteCode, who, 1, "2025-12-20");
  assignRole(chama.id, amina, brian.key, "treasurer");
  assignRole(chama.id, amina, chebet.key, "secretary");
  return getChama(chama.id)!;
}

/** Contribution entered by the member, confirmed by an officer who isn't them. */
function contribute(chamaId: string, who: ChamaWho, amount = 100_000) {
  const id = submitReceipt(chamaId, who, { memberKey: who.key, kind: "contribution", amountMinor: amount, rail: "mpesa", reference: code() });
  decideReceipt(id, who.key === brian.key ? amina : brian, "confirm");
}

describe("founding and joining a chama", () => {
  it("makes the founder chairperson and adopts constitution v1", () => {
    const chama = createChama(RULES(), amina, "2025-12-15");
    expect(chama.constitutionVersion).toBe(1);
    expect(chama.status).toBe("forming");
    expect(chama.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("refuses a group where one officer could release money alone", () => {
    expect(() => createChama(RULES({ approvalsRequired: 1 }), amina, "2025-12-15")).toThrow(ChamaError);
  });

  it("becomes active at its minimum membership", () => {
    const chama = setUp();
    expect(chama.status).toBe("active");
  });

  it("will not sign a member up to a constitution they haven't seen", () => {
    const chama = createChama(RULES(), amina, "2025-12-15");
    expect(() => joinChama(chama.inviteCode, brian, 2, "2025-12-20")).toThrow(/changed/);
  });

  it("keeps a person's chama out of their employer's activity log", () => {
    setUp();
    const leaked = db().prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE action LIKE 'chama.%' AND company_id IS NOT NULL`).get() as { n: number };
    expect(leaked.n).toBe(0);
  });

  it("lets nobody change their own role", () => {
    const chama = setUp();
    expect(() => assignRole(chama.id, amina, amina.key, "treasurer")).toThrow(/own role/);
    expect(() => assignRole(chama.id, brian, dan.key, "secretary")).toThrow(/chairperson/);
  });
});

describe("money in", () => {
  it("only reaches the books once a second officer confirms it", () => {
    const chama = setUp();
    const id = submitReceipt(chama.id, dan, { memberKey: dan.key, kind: "contribution", amountMinor: 100_000, rail: "mpesa", reference: "sjk1234abc" });
    expect(groupBalance(chama.id)).toBe(0);
    expect(() => decideReceipt(id, dan, "confirm")).toThrow(ChamaError);
    expect(() => decideReceipt(id, chebet, "confirm")).toThrow(/treasurer or chairperson/);
    decideReceipt(id, brian, "confirm");
    expect(groupBalance(chama.id)).toBe(100_000);
  });

  it("won't count one M-Pesa code twice", () => {
    const chama = setUp();
    submitReceipt(chama.id, dan, { memberKey: dan.key, kind: "contribution", amountMinor: 100_000, rail: "mpesa", reference: "QWE1234567" });
    expect(() =>
      submitReceipt(chama.id, chebet, { memberKey: chebet.key, kind: "contribution", amountMinor: 100_000, rail: "mpesa", reference: "qwe1234567" }),
    ).toThrow(/already been recorded/);
  });

  it("won't let the treasurer confirm their own payment", () => {
    const chama = setUp();
    const id = submitReceipt(chama.id, brian, { memberKey: brian.key, kind: "contribution", amountMinor: 100_000, rail: "mpesa", reference: code() });
    expect(() => decideReceipt(id, brian, "confirm")).toThrow(ChamaError);
    decideReceipt(id, amina, "confirm");
    expect(groupBalance(chama.id)).toBe(100_000);
  });

  it("makes a rejection carry a reason", () => {
    const chama = setUp();
    const id = submitReceipt(chama.id, dan, { memberKey: dan.key, kind: "contribution", amountMinor: 100_000, rail: "bank", reference: "SLIP-001" });
    expect(() => decideReceipt(id, brian, "reject")).toThrow(/why/);
    decideReceipt(id, brian, "reject", "No such transfer on the statement");
    expect(groupBalance(chama.id)).toBe(0);
  });

  it("cannot be edited or deleted once on the books", () => {
    const chama = setUp();
    contribute(chama.id, dan);
    expect(() => db().prepare(`UPDATE chama_ledger SET amount_minor = 1 WHERE chama_id = ?`).run(chama.id)).toThrow(/append-only/);
    expect(() => db().prepare(`DELETE FROM chama_ledger WHERE chama_id = ?`).run(chama.id)).toThrow(/append-only/);
  });
});

describe("money out", () => {
  it("takes two officers who aren't the borrower, then a treasurer's reference", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);

    const loan = createRequest(chama.id, dan, { kind: "loan", amountMinor: 200_000, reason: "Stock for the kiosk", loanMonths: 4 });
    expect(() => decideRequest(loan.id, dan, "approve")).toThrow(/request you made/);
    expect(() => executeRequest(loan.id, brian, "mpesa", code())).toThrow(/approved/);

    decideRequest(loan.id, amina, "approve");
    const approved = decideRequest(loan.id, chebet, "approve");
    expect(approved.status).toBe("approved");

    expect(() => executeRequest(loan.id, chebet, "mpesa", code())).toThrow(/treasurer/);
    const done = executeRequest(loan.id, brian, "mpesa", code());
    expect(done.status).toBe("executed");
    expect(groupBalance(chama.id)).toBe(200_000);

    const view = memberDashboard(chama.id, dan.key)!;
    expect(view.loans[0].outstandingMinor).toBe(208_000);
  });

  it("won't lend beyond three times savings", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    expect(() => createRequest(chama.id, dan, { kind: "loan", amountMinor: 300_001, reason: "Too much", loanMonths: 3 })).toThrow(/borrow up to/);
  });

  it("refuses to start when there aren't enough independent officers", () => {
    const chama = createChama(RULES(), amina, "2025-12-15");
    joinChama(chama.inviteCode, brian, 1, "2025-12-20");
    joinChama(chama.inviteCode, dan, 1, "2025-12-20");
    assignRole(chama.id, amina, brian.key, "treasurer");
    contribute(chama.id, brian);
    // Only the chair and the treasurer sign; if the treasurer is borrowing, one signatory is left.
    expect(() => createRequest(chama.id, brian, { kind: "loan", amountMinor: 10_000, reason: "School fees", loanMonths: 2 })).toThrow(/officers/);
  });

  it("won't let the treasurer send money to themselves", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    const w = createRequest(chama.id, brian, { kind: "withdrawal", amountMinor: 50_000, reason: "Rent" });
    decideRequest(w.id, amina, "approve");
    decideRequest(w.id, chebet, "approve");
    expect(() => executeRequest(w.id, brian, "mpesa", code())).toThrow(/coming to you/);
  });

  it("asks members to accept an amended constitution before they sign again", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    const p = createProposal(chama.id, chebet, { kind: "amendment", title: "Raise the reserve", body: "", amendmentBody: "New rules", days: 7 });
    castVote(p, amina, "yes");
    castVote(p, brian, "yes");
    castVote(p, chebet, "yes");
    expect(listProposals(chama.id, amina.key)[0].status).toBe("carried");
    expect(getChama(chama.id)!.constitutionVersion).toBe(2);

    const w = createRequest(chama.id, dan, { kind: "withdrawal", amountMinor: 50_000, reason: "Rent" });
    expect(() => decideRequest(w.id, amina, "approve")).toThrow(/Accept constitution v2/);
    acknowledgeConstitution(chama.id, amina, 2);
    expect(decideRequest(w.id, amina, "approve").status).toBe("pending");
  });
});

describe("a merry-go-round", () => {
  it("pays the whole pot to whoever's turn it is, and only once per round", () => {
    const chama = setUp({ category: "rosca" });
    assignRole(chama.id, amina, dan.key, "loan_officer");
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);

    const payout = createRequest(chama.id, brian, { kind: "payout", reason: "Round 1" });
    expect(payout.beneficiary).toBe(amina.key);
    expect(payout.amountMinor).toBe(400_000);

    expect(memberDashboard(chama.id, brian.key)!.rotation!.roundsAway).toBe(0);
    decideRequest(payout.id, chebet, "approve");
    // The chair is this round's recipient, so the chair cannot sign for it.
    expect(() => decideRequest(payout.id, amina, "approve")).toThrow(/receive/);

    const dash = groupDashboard(chama.id)!;
    expect(dash.schedule[0].memberKey).toBe(brian.key);
  });
});

/* ------------------------------------------------------------------ *
 * Winding up, leaving, reordering — pure rules
 * ------------------------------------------------------------------ */

describe("splitting a balance between members", () => {
  it("always adds back to the total exactly", () => {
    for (const total of [0, 1, 7, 100, 99_999, 1_000_003]) {
      const shares = distributionShares(total, [
        { key: "a", amountMinor: 3 },
        { key: "b", amountMinor: 3 },
        { key: "c", amountMinor: 3 },
      ]);
      expect(shares.reduce((s, x) => s + x.amountMinor, 0)).toBe(total);
    }
  });

  it("follows savings, giving leftover units to the largest fractions", () => {
    expect(distributionShares(100, [{ key: "a", amountMinor: 1 }, { key: "b", amountMinor: 2 }])).toEqual([
      { key: "a", amountMinor: 33 },
      { key: "b", amountMinor: 67 },
    ]);
  });

  it("splits equally when nobody has savings on the books", () => {
    expect(distributionShares(10, [{ key: "a", amountMinor: 0 }, { key: "b", amountMinor: 0 }]).map((s) => s.amountMinor)).toEqual([5, 5]);
  });
});

describe("what a leaver is owed", () => {
  it("is their savings in a savings group", () => {
    expect(exitSettlement(categoryFor("asca").features, { savingsMinor: 500, contributedMinor: 900, receivedMinor: 0 })).toEqual({ refundMinor: 500, owesMinor: 0 });
  });

  it("is what they paid and haven't had back in a merry-go-round", () => {
    const rosca = categoryFor("rosca").features;
    expect(exitSettlement(rosca, { savingsMinor: 0, contributedMinor: 300, receivedMinor: 0 })).toEqual({ refundMinor: 300, owesMinor: 0 });
    expect(exitSettlement(rosca, { savingsMinor: 0, contributedMinor: 300, receivedMinor: 1000 })).toEqual({ refundMinor: 0, owesMinor: 700 });
  });
});

describe("changing the payout order", () => {
  it("accepts only a reordering of the same people", () => {
    expect(reorderAllowed(["a", "b", "c"], ["c", "a", "b"], 0)).toBe(true);
    expect(reorderAllowed(["a", "b", "c"], ["a", "b"], 0)).toBe(false);
    expect(reorderAllowed(["a", "b", "c"], ["a", "a", "b"], 0)).toBe(false);
    expect(reorderAllowed(["a", "b", "c"], ["a", "b", "z"], 0)).toBe(false);
  });

  it("can pin the positions already paid this cycle", () => {
    expect(reorderAllowed(["a", "b", "c"], ["b", "a", "c"], 1)).toBe(false);
    expect(reorderAllowed(["a", "b", "c"], ["a", "c", "b"], 1)).toBe(true);
  });

  it("moves one member and shifts the rest", () => {
    expect(moveInOrder(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c", "d"], "a", 9)).toEqual(["b", "c", "d", "a"]);
  });
});

describe("collections and overdue loans", () => {
  it("counts who covered each period, oldest first", () => {
    const rows = collectionsByPeriod("2026-01-01", "monthly", 100, "2026-03-15", [
      { joinedOn: "2026-01-01", paidMinor: 300 },
      { joinedOn: "2026-01-01", paidMinor: 100 },
      { joinedOn: "2026-02-10", paidMinor: 0 },
    ]);
    expect(rows.map((r) => [r.liable, r.paidUp])).toEqual([[2, 2], [2, 1], [3, 1]]);
  });

  it("calls installments overdue only once their date has passed", () => {
    const schedule = loanSchedule({ principalMinor: 300, monthlyRateBps: 0, months: 3, startOn: "2026-01-01" });
    expect(loanOverdue(schedule, 0, "2026-02-01")).toEqual({ overdueMinor: 0, installments: 0 });
    expect(loanOverdue(schedule, 0, "2026-03-02")).toEqual({ overdueMinor: 200, installments: 2 });
    expect(loanOverdue(schedule, 150, "2026-03-02")).toEqual({ overdueMinor: 50, installments: 1 });
  });

  it("caps target progress at 100%", () => {
    expect(targetProgressBps(500, 1000)).toBe(5000);
    expect(targetProgressBps(5000, 1000)).toBe(10_000);
    expect(targetProgressBps(5000, 0)).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Against the database
 * ------------------------------------------------------------------ */

const vote = (chamaId: string, proposal: string, voters: ChamaWho[]) => voters.forEach((v) => castVote(proposal, v, "yes"));

describe("electing a chair, reordering, leaving", () => {
  it("hands the chair over only when a vote carries", () => {
    const chama = setUp();
    const p = createProposal(chama.id, dan, { kind: "chair", title: "New chair", body: "", candidate: chebet.key, days: 7 });
    vote(chama.id, p, [amina, brian, dan]);
    expect(getMember(chama.id, chebet.key)!.role).toBe("chairperson");
    expect(getMember(chama.id, amina.key)!.role).toBe("member");
  });

  it("reorders a merry-go-round without paying anyone twice", () => {
    const chama = setUp({ category: "rosca" });
    assignRole(chama.id, amina, dan.key, "loan_officer");
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    const first = createRequest(chama.id, brian, { kind: "payout", reason: "Round 1" });
    expect(first.beneficiary).toBe(amina.key);

    // Put Amina — already paid this cycle — back at the front, and Dan second.
    const order = [amina.key, dan.key, brian.key, chebet.key];
    const p = createProposal(chama.id, chebet, { kind: "payout_order", title: "Reorder", body: "", order, days: 7 });
    vote(chama.id, p, [amina, brian, chebet]);
    expect(payoutQueue(chama.id)).toEqual([dan.key, brian.key, chebet.key, amina.key]);
  });

  it("lets a member with nothing owed leave at once, and refunds a saver through signatures", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    expect(() => requestExit(chama.id, amina, "")).toThrow(/chair/);

    const r = requestExit(chama.id, dan, "Moving to Kisumu")!;
    expect(r.kind).toBe("exit");
    expect(r.amountMinor).toBe(100_000);
    decideRequest(r.id, amina, "approve");
    decideRequest(r.id, chebet, "approve");
    executeRequest(r.id, brian, "mpesa", code());
    expect(getMember(chama.id, dan.key)!.status).toBe("exited");
    expect(groupBalance(chama.id)).toBe(300_000);
  });

  it("won't let a borrower walk away from a loan", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    const loan = createRequest(chama.id, dan, { kind: "loan", amountMinor: 50_000, reason: "Stock", loanMonths: 2 });
    decideRequest(loan.id, amina, "approve");
    decideRequest(loan.id, chebet, "approve");
    executeRequest(loan.id, brian, "mpesa", code());
    expect(() => requestExit(chama.id, dan, "")).toThrow(/loan/);
  });

  it("keeps a nominee's details out of the audit trail", () => {
    const chama = setUp();
    setNominee(chama.id, dan, { name: "Grace Mwangi", phone: "+254711000111", relation: "Spouse" });
    expect(getMember(chama.id, dan.key)!.nominee).toEqual({ name: "Grace Mwangi", phone: "+254711000111", relation: "Spouse" });
    const leaked = db().prepare(`SELECT COUNT(*) AS n FROM audit_events WHERE summary LIKE '%Grace%' OR detail LIKE '%Grace%'`).get() as { n: number };
    expect(leaked.n).toBe(0);
  });
});

describe("dissolving a chama", () => {
  it("stops new money, pays the balance out by savings, and closes at zero", () => {
    const chama = setUp();
    contribute(chama.id, amina, 100_000);
    contribute(chama.id, brian, 200_000);
    contribute(chama.id, chebet, 100_000);
    contribute(chama.id, dan, 100_000);

    const p = createProposal(chama.id, chebet, { kind: "dissolution", title: "Wind up", body: "We're done", days: 7 });
    vote(chama.id, p, [amina, brian, chebet]);
    expect(getChama(chama.id)!.status).toBe("dissolving");
    expect(() =>
      submitReceipt(chama.id, dan, { memberKey: dan.key, kind: "contribution", amountMinor: 100_000, rail: "mpesa", reference: code() }),
    ).toThrow(/dissolve/);
    expect(() => createRequest(chama.id, dan, { kind: "withdrawal", amountMinor: 1, reason: "Mine" })).toThrow(/dissolve/);

    // Appoint enough independent signers for each share.
    assignRole(chama.id, amina, dan.key, "loan_officer");
    const shares = startDistribution(chama.id, brian);
    expect(shares.map((r) => r.amountMinor).sort((a, b) => a - b)).toEqual([100_000, 100_000, 100_000, 200_000]);

    for (const r of shares) {
      const signers = [amina, chebet, dan, brian].filter((x) => x.key !== r.beneficiary && x.key !== brian.key).slice(0, 2);
      for (const s of signers) decideRequest(r.id, s, "approve");
      // The treasurer can't send their own share, so the chair records that one.
      const sender = r.beneficiary === brian.key ? amina : brian;
      if (r.beneficiary === brian.key) expect(() => executeRequest(r.id, brian, "bank", `DIST-${r.id}`)).toThrow(/coming to you/);
      executeRequest(r.id, sender, "bank", `DIST-${r.id}`);
    }
    expect(groupBalance(chama.id)).toBe(0);
    expect(groupStatement(chama.id).find((l) => l.kind === "distribution")!.totalMinor).toBe(500_000);
    expect(getChama(chama.id)!.status).toBe("dissolved");
  });

  it("won't let the chair send money to anyone but the treasurer", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    const w = createRequest(chama.id, dan, { kind: "withdrawal", amountMinor: 50_000, reason: "Rent" });
    decideRequest(w.id, amina, "approve");
    decideRequest(w.id, chebet, "approve");
    expect(() => executeRequest(w.id, amina, "mpesa", code())).toThrow(/treasurer/);
  });
});

describe("notifications", () => {
  it("tells officers what they can act on, and nothing they can't", () => {
    const chama = setUp();
    submitReceipt(chama.id, dan, { memberKey: dan.key, kind: "contribution", amountMinor: 100_000, rail: "mpesa", reference: code() });
    const forBrian = notificationsFor(brian.key, "2025-12-20").filter((n) => n.chamaId === chama.id);
    expect(forBrian.some((n) => /to check/.test(n.text))).toBe(true);
    const forDan = notificationsFor(dan.key, "2025-12-20").filter((n) => n.chamaId === chama.id);
    expect(forDan.some((n) => /to check/.test(n.text))).toBe(false);
  });

  it("reminds a member when a contribution is close, and stops once they're behind it", () => {
    const chama = setUp();
    const soon = notificationsFor(dan.key, "2025-12-30").filter((n) => n.chamaId === chama.id);
    expect(soon.some((n) => /due in 2 days/.test(n.text))).toBe(true);
    const late = notificationsFor(dan.key, "2026-01-10").filter((n) => n.chamaId === chama.id);
    expect(late.some((n) => /behind by/.test(n.text))).toBe(true);
  });
});

describe("closing a dissolved chama", () => {
  it("won't write off a loan by closing with it still owed", () => {
    const chama = setUp();
    for (const who of [amina, brian, chebet, dan]) contribute(chama.id, who);
    const loan = createRequest(chama.id, dan, { kind: "loan", amountMinor: 300_000, reason: "Stock", loanMonths: 3 });
    decideRequest(loan.id, amina, "approve");
    decideRequest(loan.id, chebet, "approve");
    executeRequest(loan.id, brian, "mpesa", code());
    // Brian takes the rest out, so the books read zero while Dan still owes.
    const w = createRequest(chama.id, brian, { kind: "withdrawal", amountMinor: 90_000, reason: "Fees" });
    decideRequest(w.id, amina, "approve");
    decideRequest(w.id, chebet, "approve");
    executeRequest(w.id, amina, "mpesa", code());
    const p = createProposal(chama.id, chebet, { kind: "dissolution", title: "Wind up", body: "", days: 7 });
    vote(chama.id, p, [amina, brian, chebet]);
    expect(groupBalance(chama.id)).toBe(10_000);
    expect(() => startDistribution(chama.id, brian)).toThrow(/still to be repaid/);
    expect(() => closeChama(chama.id, amina)).toThrow();
    expect(getChama(chama.id)!.status).toBe("dissolving");
  });
});
