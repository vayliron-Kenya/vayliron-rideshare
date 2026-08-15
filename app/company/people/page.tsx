import { addEmployeeAction, setEmployeeActiveAction, updateEmployeeAction } from "@/app/company-actions";
import { ActionForm, Field, SelectField } from "@/components/action-form";
import { CompanyTabs } from "@/components/company-tabs";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { getCompanyAdmin } from "@/lib/auth";
import { formatKes } from "@/lib/domain/fares";
import { addDays, nairobiDate } from "@/lib/domain/time";
import { listEmployees, listStops, riderSpend } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "People" };

interface PageProps {
  searchParams: Promise<{ edit?: string; show?: string }>;
}

export default async function CompanyPeoplePage({ searchParams }: PageProps) {
  const session = await getCompanyAdmin();
  if (!session) {
    return (
      <EmptyState
        title="Admins only"
        body="Managing staff is limited to the HR admins on your Vayliron account."
      />
    );
  }

  const { edit, show } = await searchParams;
  const showInactive = show === "inactive";

  const today = nairobiDate();
  const employees = listEmployees(session.company.id);
  const stops = listStops();
  const spend = new Map(
    riderSpend(session.company.id, addDays(today, -29), today).map((r) => [r.employee.id, r]),
  );

  const visible = employees.filter((e) => (showInactive ? true : e.active === 1));
  const active = employees.filter((e) => e.active === 1);
  const admins = active.filter((e) => e.role === "admin");
  const editing = edit ? employees.find((e) => e.id === edit) : undefined;

  const stopOptions = stops.map((s) => ({ value: s.id, label: `${s.name} — ${s.landmark}` }));

  return (
    <div className="space-y-6">
      <CompanyTabs active="people" />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-body">People</h1>
        <p className="mt-1 text-sm text-muted">
          {active.length} active staff on the {session.company.name} account · {admins.length}{" "}
          {admins.length === 1 ? "admin" : "admins"}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active staff" value={active.length} />
        <Stat
          label="Rode in last 30 days"
          value={[...spend.values()].filter((r) => r.trips > 0).length}
          tone="brand"
        />
        <Stat label="Deactivated" value={employees.length - active.length} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-body">
              {editing ? `Edit ${editing.name}` : "Add someone"}
            </h2>

            {editing ? (
              <ActionForm
                action={updateEmployeeAction}
                submit="Save changes"
                className="mt-4 space-y-3"
                footer={
                  <a href="/company/people" className="text-xs text-muted hover:text-body">
                    Cancel
                  </a>
                }
              >
                <input type="hidden" name="employeeId" value={editing.id} />
                <p className="rounded-lg bg-raised px-3 py-2 text-xs text-muted">
                  {editing.email} · staff no. {editing.staffNo}
                </p>
                <Field label="Phone" name="phone" defaultValue={editing.phone} required />
                <SelectField
                  label="Home stage"
                  name="homeStopId"
                  options={stopOptions}
                  defaultValue={editing.homeStopId ?? ""}
                  includeBlank="Not set"
                />
                <SelectField
                  label="Workplace stage"
                  name="workStopId"
                  options={stopOptions}
                  defaultValue={editing.workStopId ?? ""}
                  includeBlank="Not set"
                />
                <SelectField
                  label="Role"
                  name="role"
                  defaultValue={editing.role === "admin" ? "admin" : "employee"}
                  options={[
                    { value: "employee", label: "Rider" },
                    { value: "admin", label: "Rider + HR admin" },
                  ]}
                  hint="Admins can manage staff, the subsidy policy and invoices."
                />
              </ActionForm>
            ) : (
              <ActionForm
                action={addEmployeeAction}
                submit="Add to account"
                resetOnSuccess
                className="mt-4 space-y-3"
              >
                <Field label="Full name" name="name" placeholder="Wanjiku Karanja" required />
                <Field
                  label="Work email"
                  name="email"
                  type="email"
                  placeholder={`name@${session.company.emailDomain}`}
                  required
                  hint={`Must be on @${session.company.emailDomain}.`}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone" name="phone" placeholder="+254712345678" required />
                  <Field label="Staff no." name="staffNo" placeholder="TB-0142" required />
                </div>
                <SelectField
                  label="Home stage"
                  name="homeStopId"
                  options={stopOptions}
                  includeBlank="Set later"
                />
                <SelectField
                  label="Workplace stage"
                  name="workStopId"
                  options={stopOptions}
                  includeBlank="Set later"
                />
                <SelectField
                  label="Role"
                  name="role"
                  options={[
                    { value: "employee", label: "Rider" },
                    { value: "admin", label: "Rider + HR admin" },
                  ]}
                />
              </ActionForm>
            )}
          </Card>

          <Card className="px-5 py-4">
            <p className="text-xs leading-relaxed text-faint">
              Deactivating someone releases any seat they hold on a future departure, so the bus
              goes back on sale rather than running with an empty reserved seat.
            </p>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Staff"
            subtitle={`${visible.length} shown`}
            action={
              <a
                href={showInactive ? "/company/people" : "/company/people?show=inactive"}
                className="whitespace-nowrap text-xs text-muted transition-colors hover:text-brand-bright"
              >
                {showInactive ? "Hide deactivated" : "Show deactivated"}
              </a>
            }
          />

          {visible.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nobody yet" body="Add your first rider with the form alongside." />
            </div>
          ) : (
            <div className="max-h-[40rem] overflow-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Staff no.</th>
                    <th className="px-5 py-3 text-right font-medium">Trips (30d)</th>
                    <th className="px-5 py-3 text-right font-medium">Employer paid</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((employee) => {
                    const stats = spend.get(employee.id);
                    return (
                      <tr
                        key={employee.id}
                        className={employee.active ? "text-muted" : "text-faint"}
                      >
                        <td className="px-5 py-3">
                          <span className={employee.active ? "text-body" : ""}>
                            {employee.name}
                          </span>
                          <span className="ml-2 text-xs text-faint">{employee.email}</span>
                        </td>
                        <td className="tabular whitespace-nowrap px-5 py-3 text-xs">
                          {employee.staffNo}
                        </td>
                        <td className="tabular px-5 py-3 text-right">{stats?.trips ?? 0}</td>
                        <td className="tabular whitespace-nowrap px-5 py-3 text-right">
                          {formatKes(stats?.employerKes ?? 0)}
                        </td>
                        <td className="px-5 py-3">
                          {employee.role === "admin" ? (
                            <Badge tone="sky">Admin</Badge>
                          ) : (
                            <Badge>Rider</Badge>
                          )}
                          {!employee.active ? (
                            <Badge tone="flame" className="ml-1.5">
                              Off
                            </Badge>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={`/company/people?edit=${employee.id}${showInactive ? "&show=inactive" : ""}`}
                              className="rounded-lg border border-edge px-2.5 py-1 text-xs text-muted transition-colors hover:text-body"
                            >
                              Edit
                            </a>
                            <ActiveToggle
                              employeeId={employee.id}
                              active={employee.active === 1}
                              isSelf={employee.id === session.employee.id}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ActiveToggle({
  employeeId,
  active,
  isSelf,
}: {
  employeeId: string;
  active: boolean;
  isSelf: boolean;
}) {
  if (isSelf) {
    return <span className="px-2.5 py-1 text-xs text-faint">You</span>;
  }

  return (
    <ActionForm
      action={setEmployeeActiveAction}
      submit={active ? "Deactivate" : "Reactivate"}
      tone="quiet"
      compact
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
    </ActionForm>
  );
}
