import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { buildPositionPayload } from "@/lib/position";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { tripId } = await params;
  const payload = buildPositionPayload(tripId);
  if (!payload) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
}
