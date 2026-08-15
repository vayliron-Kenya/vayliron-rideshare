export type Direction = "inbound" | "outbound";

export type TripStatus =
  | "scheduled"
  | "boarding"
  | "in_transit"
  | "completed"
  | "cancelled";

export type BookingStatus = "booked" | "boarded" | "no_show" | "cancelled";

export type Role = "employee" | "admin" | "driver";

export interface Stop {
  id: string;
  name: string;
  slug: string;
  area: string;
  landmark: string;
  lat: number;
  lng: number;
}

export interface Route {
  id: string;
  code: string;
  name: string;
  slug: string;
  corridor: string;
  blurb: string;
  active: number;
}

/** A stop as it sits on a particular route, in travel order. */
export interface RouteStop extends Stop {
  seq: number;
  kmFromStart: number;
  minFromStart: number;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  capacity: number;
  wifi: number;
  usbPorts: number;
  operator: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  psvLicence: string;
  ratingBps: number;
}

export interface Company {
  id: string;
  name: string;
  emailDomain: string;
  billingEmail: string;
  kraPin: string;
  subsidyBps: number;
  monthlyCapKes: number;
}

export interface Employee {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone: string;
  staffNo: string;
  homeStopId: string | null;
  workStopId: string | null;
  role: Role;
  active: number;
}

export interface Trip {
  id: string;
  routeId: string;
  direction: Direction;
  serviceDate: string;
  departTime: string;
  vehicleId: string;
  driverId: string;
  capacity: number;
  status: TripStatus;
}

export interface Booking {
  id: string;
  tripId: string;
  employeeId: string;
  boardStopId: string;
  alightStopId: string;
  seatNo: number;
  fareKes: number;
  employerKes: number;
  employeeKes: number;
  passCode: string;
  status: BookingStatus;
  createdAt: string;
  boardedAt: string | null;
}
