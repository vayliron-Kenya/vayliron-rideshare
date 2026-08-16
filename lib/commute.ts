import { nextServiceDate } from "@/lib/domain/schedule";
import { addDays } from "@/lib/domain/time";
import { commuteMatches, listTrips, type TripSummary } from "@/lib/queries";
import type { Direction } from "@/lib/types";

/**
 * The departures that are actually any use to one commuter.
 *
 * Every rider has a home stage and a work stage on file, which turns "what
 * buses are there" into a much narrower question: which departures run between
 * those two points, in either direction, that they have not already missed.
 * The Now and Ride tabs both ask it, so it lives here rather than in a page.
 */
export interface Suggestion {
  trip: TripSummary;
  boardStopId: string;
  alightStopId: string;
  km: number;
  direction: Direction;
}

/**
 * Rolls forward until there is actually something to catch.
 *
 * By late afternoon every remaining departure on the day has gone, and showing
 * a commuter an empty list when Monday's bus is sitting right there is simply
 * wrong. Looks up to a week ahead, which covers a Sunday and a public holiday
 * back to back.
 */
export function nextDeparturesFor(
  homeStopId: string,
  workStopId: string,
  from: string,
  now: Date,
  limit = 8,
): { serviceDate: string; suggestions: Suggestion[] } {
  let serviceDate = from;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const suggestions = buildSuggestions(homeStopId, workStopId, serviceDate, now, limit);
    if (suggestions.length > 0) return { serviceDate, suggestions };
    serviceDate = nextServiceDate(addDays(serviceDate, 1));
  }

  return { serviceDate: from, suggestions: [] };
}

/**
 * Morning departures towards work and evening departures back home, on the
 * lines that serve both of this person's stages.
 */
function buildSuggestions(
  homeStopId: string,
  workStopId: string,
  serviceDate: string,
  now: Date,
  limit: number,
): Suggestion[] {
  const legs = [
    { from: homeStopId, to: workStopId },
    { from: workStopId, to: homeStopId },
  ];

  const suggestions: Suggestion[] = [];

  for (const leg of legs) {
    for (const match of commuteMatches(leg.from, leg.to)) {
      const trips = listTrips({
        serviceDate,
        routeId: match.route.id,
        direction: match.direction,
      });

      for (const trip of trips) {
        // Hide departures whose boarding stage has already been passed today.
        const board = trip.timetable.find((s) => s.id === leg.from);
        if (!board) continue;
        const boardsAt = trip.departsAt.getTime() + board.adjustedMin * 60000;
        if (boardsAt < now.getTime()) continue;

        suggestions.push({
          trip,
          boardStopId: leg.from,
          alightStopId: leg.to,
          km: match.km,
          direction: match.direction,
        });
      }
    }
  }

  return suggestions
    .sort((a, b) => a.trip.departsAt.getTime() - b.trip.departsAt.getTime())
    .slice(0, limit);
}
