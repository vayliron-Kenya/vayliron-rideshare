import { actorFrom, getPrincipal } from "@/lib/auth";
import { getMember, groupStatement, ledger, listMembers, memberDashboard, getChama, whoFromActor } from "@/lib/chama";
import { can, minorDigits } from "@/lib/domain/chama";
import { nairobiDate } from "@/lib/domain/time";

export const dynamic = "force-dynamic";

/** Quotes a CSV field, doubling embedded quotes. Leading =+-@ is defused so a spreadsheet never runs it as a formula. */
function cell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A statement from the confirmed ledger.
 *
 * `?scope=me` (the default) is the signed-in member's own statement; any
 * member can download it. `?scope=group` is the whole group's book and is
 * limited to officers and the auditor.
 */
export async function GET(request: Request, { params }: { params: Promise<{ chamaId: string }> }) {
  const principal = await getPrincipal();
  if (!principal || principal.kind === "operator") return new Response("Not authorised", { status: 403 });
  const { chamaId } = await params;
  const me = whoFromActor(actorFrom(principal));
  const member = getMember(chamaId, me.key);
  const chama = getChama(chamaId);
  if (!member || !chama) return new Response("Not found", { status: 404 });

  const scope = new URL(request.url).searchParams.get("scope") === "group" ? "group" : "me";
  if (scope === "group" && !can(member.role, "view_books")) return new Response("Officers only", { status: 403 });

  const digits = minorDigits(chama.currency);
  const amount = (minor: number) => (minor / 10 ** digits).toFixed(digits);
  const names = new Map(listMembers(chamaId, true).map((m) => [m.key, m.name]));
  const nameOf = (key: string) => names.get(key) ?? "Former member";
  const today = nairobiDate();

  const rows: (string | number)[][] = [
    [`${chama.name} — ${scope === "group" ? "group statement" : `statement for ${member.name}`}`],
    ["Currency", chama.currency],
    ["Generated", today],
    ["Source", "Confirmed ledger entries only. Each was recorded by one person and confirmed by another."],
    [],
  ];

  if (scope === "me") {
    const view = memberDashboard(chamaId, me.key, today)!;
    rows.push(
      ["Contributed", amount(view.standing.paidMinor)],
      ["Due to date", amount(view.standing.expectedMinor)],
      ["Arrears", amount(view.standing.arrearsMinor)],
      ["Late fees outstanding", amount(view.standing.lateFeesOutstandingMinor)],
      ["Savings", amount(view.savingsMinor)],
      ["Loans outstanding", amount(view.loans.reduce((s, l) => s + l.outstandingMinor, 0))],
      [],
    );
  } else {
    for (const line of groupStatement(chamaId)) {
      rows.push([line.direction === "in" ? "Total in" : "Total out", line.kind, amount(line.totalMinor), `${line.entries} entries`]);
    }
    rows.push([]);
  }

  rows.push(["Date", "Member", "Type", "Direction", "Amount", "Rail", "Reference", "Recorded by", "Confirmed by"]);
  for (const e of ledger(chamaId, scope === "me" ? me.key : undefined, 100_000).reverse()) {
    rows.push([e.at.slice(0, 10), nameOf(e.memberKey), e.kind, e.direction, amount(e.amountMinor), e.rail, e.reference, nameOf(e.recordedBy), nameOf(e.confirmedBy)]);
  }

  const slug = chama.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(rows.map((r) => r.map(cell).join(",")).join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${scope}-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
