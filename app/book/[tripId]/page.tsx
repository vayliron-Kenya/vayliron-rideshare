import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BookingFlow, type StopOption } from "@/components/booking-flow";
import { AlertIcon, BusIcon, HomeIcon, WorkIcon } from "@/components/icons";
import { BigButton, Notice } from "@/components/simple";
import { getSession } from "@/lib/auth";
import { crowding, CROWDING_LABEL } from "@/lib/domain/boarding";
import { formatServiceDate, nairobiDate } from "@/lib/domain/time";
import { employerSpendThisMonth, getTrip } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ board?: string; alight?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const trip = getTrip((await params).tripId);
  return { title: trip ? `Book ${trip.route.code} ${trip.trip.departTime}` : "Book a seat" };
}

export default async function BookPage({ params, searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/");

  const { tripId } = await params;
  const query = await searchParams;

  const trip = getTrip(tripId);
  if (!trip) notFound();

  const stops: StopOption[] = trip.timetable.map((entry) => ({
    id: entry.id,
    name: entry.name,
    landmark: entry.landmark,
    time: entry.time,
    seq: entry.seq,
    kmFromStart: entry.kmFromStart,
  }));

  const closed =
    trip.trip.status === "completed" ||
    trip.trip.status === "cancelled" ||
    trip.departsAt.getTime() <= Date.now();

  // Prefer the leg the rider arrived with; otherwise their own home/work stages;
  // otherwise the whole line.
  const defaultBoard =
    pickStop(stops, query.board) ??
    pickStop(stops, session.employee.homeStopId) ??
    stops[0];
  const defaultAlight =
    pickStop(stops, query.alight, defaultBoard.seq) ??
    pickStop(stops, session.employee.workStopId, defaultBoard.seq) ??
    stops[stops.length - 1];

  const minutesToDeparture = (trip.departsAt.getTime() - Date.now()) / 60000;

  return (
    <div className="space-y-6 pb-8">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center text-base text-muted transition-colors hover:text-body"
        >
          ← Back
        </Link>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="tabular text-4xl font-bold tracking-tight text-body">
            {trip.trip.departTime}
          </h1>
          <p className="text-lg text-muted">{formatServiceDate(trip.trip.serviceDate)}</p>
        </div>

        <p className="mt-2 flex items-center gap-2 text-lg text-body">
          {trip.trip.direction === "inbound" ? (
            <WorkIcon className="size-5 shrink-0 text-muted" />
          ) : (
            <HomeIcon className="size-5 shrink-0 text-muted" />
          )}
          {trip.trip.direction === "inbound" ? "Going to work" : "Going home"}
          <span className="text-muted">·</span>
          <span className="text-muted">{trip.route.name}</span>
        </p>
      </header>

      {closed ? (
        <>
          <Notice
            tone="bad"
            icon={<AlertIcon className="size-6" />}
            title="This bus has already left"
          >
            You can still book a later one on the same route.
          </Notice>
          <BigButton href={`/routes/${trip.route.slug}`} tone="quiet">
            See later buses
          </BigButton>
        </>
      ) : trip.seatsAvailable === 0 ? (
        <>
          <Notice tone="bad" icon={<AlertIcon className="size-6" />} title="This bus is full">
            Every place is taken. Try a later bus on the same route.
          </Notice>
          <BigButton href={`/routes/${trip.route.slug}`} tone="quiet">
            See later buses
          </BigButton>
        </>
      ) : (
        <>
          <Notice
            tone="good"
            icon={<BusIcon className="size-6" />}
            title={CROWDING_LABEL[crowding(trip.trip.capacity, trip.seatsBooked)]}
          >
            Check the two ends of your journey and you are on.
          </Notice>

          <BookingFlow
            tripId={trip.trip.id}
            stops={stops}
            defaultBoardId={defaultBoard.id}
            defaultAlightId={defaultAlight.id}
            subsidyBps={session.company.subsidyBps}
            monthlyCapKes={session.company.monthlyCapKes}
            monthToDateKes={employerSpendThisMonth(
              session.employee.id,
              trip.trip.serviceDate || nairobiDate(),
            )}
            companyName={session.company.name}
          />
        </>
      )}
    </div>
  );
}

function pickStop(
  stops: StopOption[],
  id: string | null | undefined,
  afterSeq?: number,
): StopOption | undefined {
  if (!id) return undefined;
  const found = stops.find((s) => s.id === id);
  if (!found) return undefined;
  if (afterSeq !== undefined && found.seq <= afterSeq) return undefined;
  return found;
}
