import { getCompanyAdmin } from "@/lib/auth";
import { nairobiDate } from "@/lib/domain/time";
import { monthlyInvoice } from "@/lib/ops";

export const dynamic = "force-dynamic";

/** Quotes a CSV field, doubling any embedded quotes. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: Request) {
  const session = await getCompanyAdmin();
  if (!session) {
    return new Response("Not authorised", { status: 403 });
  }

  const requested = new URL(request.url).searchParams.get("month");
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : nairobiDate().slice(0, 7);

  const invoice = monthlyInvoice(session.company.id, month);
  if (!invoice) return new Response("Not found", { status: 404 });

  const rows: (string | number)[][] = [
    ["Vayliron Mobility Ltd — commuter invoice"],
    ["Client", invoice.company.name],
    ["KRA PIN", invoice.company.kraPin],
    ["Billing email", invoice.company.billingEmail],
    ["Month", month],
    ["Currency", "KES"],
    ["VAT", "Exempt — road passenger transport"],
    [],
    ["Employee", "Staff no.", "Trips", "Employer share", "Payroll deduction"],
    ...invoice.lines.map((line) => [
      line.name,
      line.staffNo,
      line.trips,
      line.employerKes,
      line.employeeKes,
    ]),
    [],
    ["Total", "", invoice.trips, invoice.employerTotalKes, invoice.employeeTotalKes],
  ];

  const csv = rows.map((row) => row.map(cell).join(",")).join("\n");
  const filename = `vayliron-${invoice.company.emailDomain.split(".")[0]}-${month}.csv`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
