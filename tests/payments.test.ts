import { describe, expect, it } from "vitest";

import {
  formatPhone,
  generateReceipt,
  normalisePhone,
  splitPayment,
} from "@/lib/domain/payments";

describe("splitting a fare between the owner and the network", () => {
  it("gives the owner their contracted share", () => {
    expect(splitPayment(200, 8500)).toEqual({
      amountKes: 200,
      ownerKes: 170,
      networkKes: 30,
    });
  });

  it("always adds back to exactly what the rider paid", () => {
    for (const amount of [1, 7, 33, 199, 220, 301, 4999]) {
      for (const bps of [0, 1, 5000, 8500, 9999, 10000]) {
        const split = splitPayment(amount, bps);
        expect(split.ownerKes + split.networkKes).toBe(amount);
      }
    }
  });

  it("rounds in the network's favour rather than losing a shilling", () => {
    // 8500 bps of 33 is 28.05 — the owner gets 28, the odd shilling stays put.
    expect(splitPayment(33, 8500)).toEqual({ amountKes: 33, ownerKes: 28, networkKes: 5 });
  });

  it("handles a free ride without inventing money", () => {
    expect(splitPayment(0, 8500)).toEqual({ amountKes: 0, ownerKes: 0, networkKes: 0 });
  });

  it("can hand the owner everything or nothing", () => {
    expect(splitPayment(200, 10000).ownerKes).toBe(200);
    expect(splitPayment(200, 0).ownerKes).toBe(0);
  });

  it("refuses nonsense", () => {
    expect(() => splitPayment(-1, 8500)).toThrow(RangeError);
    expect(() => splitPayment(100, 10001)).toThrow(RangeError);
    expect(() => splitPayment(100, -1)).toThrow(RangeError);
  });
});

describe("Kenyan mobile numbers", () => {
  it("accepts the three shapes people actually type", () => {
    expect(normalisePhone("0712345678")).toBe("254712345678");
    expect(normalisePhone("712345678")).toBe("254712345678");
    expect(normalisePhone("+254 712 345 678")).toBe("254712345678");
  });

  it("accepts Airtel's 01 range as well as Safaricom's 07", () => {
    expect(normalisePhone("0112345678")).toBe("254112345678");
  });

  it("ignores whatever punctuation someone types between the digits", () => {
    expect(normalisePhone("0722 123 456")).toBe("254722123456");
    expect(normalisePhone("0722-123-456")).toBe("254722123456");
    expect(normalisePhone("(0722) 123456")).toBe("254722123456");
  });

  it("rejects a number with one digit too many", () => {
    expect(normalisePhone("0722 123 4567")).toBeNull();
  });

  it("rejects a number nobody could push to", () => {
    expect(normalisePhone("")).toBeNull();
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("0812345678")).toBeNull(); // no such prefix
    expect(normalisePhone("2547123456789")).toBeNull(); // one digit too many
  });

  it("reads back in the shape a Kenyan expects", () => {
    expect(formatPhone("254712345678")).toBe("+254 712 345 678");
  });

  it("leaves anything unrecognised alone rather than mangling it", () => {
    expect(formatPhone("not a number")).toBe("not a number");
  });
});

describe("M-Pesa receipts", () => {
  it("is ten characters, like Safaricom's own", () => {
    expect(generateReceipt()).toHaveLength(10);
  });

  it("is upper-case alphanumeric", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateReceipt()).toMatch(/^[A-Z0-9]{10}$/);
    }
  });

  it("is deterministic when the randomness is", () => {
    expect(generateReceipt(() => 0)).toBe("AAAAAAAAAA");
  });
});
