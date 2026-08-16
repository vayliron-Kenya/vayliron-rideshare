import { NextResponse } from "next/server";

import { getPrincipal } from "@/lib/auth";
import { readPhoto } from "@/lib/owners";

/**
 * Serves a vehicle photograph.
 *
 * These are logbooks and number plates, not marketing shots, so they are not
 * public files under /public: the route checks that somebody is signed in, and
 * that they are either the owner or Vayliron staff. Riders have no business
 * with them at all.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const principal = await getPrincipal();
  if (principal?.kind !== "owner" && principal?.kind !== "operator") {
    return new NextResponse("Not found", { status: 404 });
  }

  const { photoId } = await params;
  const photo = readPhoto(photoId);
  if (!photo) return new NextResponse("Not found", { status: 404 });

  // An owner sees their own buses, not the account next door's logbooks.
  if (principal.kind === "owner" && photo.ownerId !== principal.owner.id) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=300",
      "Content-Length": String(photo.data.byteLength),
    },
  });
}
