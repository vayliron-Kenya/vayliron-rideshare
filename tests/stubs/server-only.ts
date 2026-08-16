/**
 * Stands in for the `server-only` package under Vitest.
 *
 * The real module throws when imported anywhere but a React Server Component,
 * which keeps server code out of client bundles — and makes any module that
 * imports it untestable. Vitest aliases this file in its place, so the guard
 * still applies to every build while the unit tests can reach the code.
 */
export {};
