import { db } from "@/lib/db";

/**
 * The audit trail.
 *
 * Every administrative write takes an `Actor`, so an unattributed change is a
 * type error rather than something someone forgot. The alternative — recording
 * from the page layer — silently misses any call made from anywhere else.
 */
export type ActorKind = "employee" | "driver" | "operator" | "system";

export interface Actor {
  kind: ActorKind;
  id: string;
  name: string;
  /** Set for client-side actors, so their company can see their own history. */
  companyId?: string;
}

/** Used by the seed and by scheduled jobs, which have no human behind them. */
export const SYSTEM_ACTOR: Actor = { kind: "system", id: "system", name: "Vayliron system" };

export type SubjectKind =
  | "trip"
  | "employee"
  | "company"
  | "driver"
  | "vehicle"
  | "route"
  | "stop"
  | "incident";

export interface AuditEvent {
  id: number;
  at: string;
  actorKind: ActorKind;
  actorId: string;
  actorName: string;
  action: string;
  subjectKind: SubjectKind;
  subjectId: string;
  subjectLabel: string;
  summary: string;
  detail: Record<string, unknown> | null;
  companyId: string | null;
}

type Row = Record<string, unknown>;

const toEvent = (r: Row): AuditEvent => ({
  id: r.id as number,
  at: r.at as string,
  actorKind: r.actor_kind as ActorKind,
  actorId: r.actor_id as string,
  actorName: r.actor_name as string,
  action: r.action as string,
  subjectKind: r.subject_kind as SubjectKind,
  subjectId: r.subject_id as string,
  subjectLabel: r.subject_label as string,
  summary: r.summary as string,
  detail: r.detail ? (JSON.parse(r.detail as string) as Record<string, unknown>) : null,
  companyId: (r.company_id as string) ?? null,
});

export interface RecordInput {
  actor: Actor;
  action: string;
  subjectKind: SubjectKind;
  subjectId: string;
  subjectLabel: string;
  summary: string;
  detail?: Record<string, unknown>;
  /** Scopes the entry to a client's own activity view. */
  companyId?: string | null;
}

/**
 * Writes one entry.
 *
 * Never throws into the caller's path: a failed audit write must not roll back
 * the operational change it describes, or a full disk would take the network
 * down. It is logged loudly instead.
 */
export function record(input: RecordInput): void {
  try {
    db()
      .prepare(
        `INSERT INTO audit_events
           (at, actor_kind, actor_id, actor_name, action,
            subject_kind, subject_id, subject_label, summary, detail, company_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        new Date().toISOString(),
        input.actor.kind,
        input.actor.id,
        input.actor.name,
        input.action,
        input.subjectKind,
        input.subjectId,
        input.subjectLabel,
        input.summary,
        input.detail ? JSON.stringify(input.detail) : null,
        input.companyId ?? input.actor.companyId ?? null,
      );
  } catch (err) {
    console.error("audit write failed", { action: input.action, err });
  }
}

export interface AuditFilter {
  /** Only entries a particular client is allowed to see. */
  companyId?: string;
  subjectKind?: SubjectKind;
  subjectId?: string;
  actorKind?: ActorKind;
  /** Matches a whole namespace when it ends in a dot, e.g. "trip.". */
  action?: string;
  limit?: number;
  offset?: number;
}

export function listAudit(filter: AuditFilter = {}): AuditEvent[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.companyId) {
    clauses.push("company_id = ?");
    params.push(filter.companyId);
  }
  if (filter.subjectKind) {
    clauses.push("subject_kind = ?");
    params.push(filter.subjectKind);
  }
  if (filter.subjectId) {
    clauses.push("subject_id = ?");
    params.push(filter.subjectId);
  }
  if (filter.actorKind) {
    clauses.push("actor_kind = ?");
    params.push(filter.actorKind);
  }
  if (filter.action) {
    if (filter.action.endsWith(".")) {
      clauses.push("action LIKE ?");
      params.push(`${filter.action}%`);
    } else {
      clauses.push("action = ?");
      params.push(filter.action);
    }
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return (
    db()
      .prepare(
        `SELECT * FROM audit_events ${where} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, filter.limit ?? 60, filter.offset ?? 0) as Row[]
  ).map(toEvent);
}

export function countAudit(filter: AuditFilter = {}): number {
  const events = listAudit({ ...filter, limit: 1000, offset: 0 });
  return events.length;
}

/** Everything that has happened to one thing, oldest last. */
export function subjectHistory(
  subjectKind: SubjectKind,
  subjectId: string,
  limit = 20,
): AuditEvent[] {
  return listAudit({ subjectKind, subjectId, limit });
}

/** The distinct action namespaces present, for the filter chips. */
export function auditNamespaces(): string[] {
  return (
    db()
      .prepare(
        `SELECT DISTINCT substr(action, 1, instr(action, '.')) AS ns
           FROM audit_events WHERE instr(action, '.') > 0 ORDER BY ns`,
      )
      .all() as Row[]
  ).map((r) => r.ns as string);
}
