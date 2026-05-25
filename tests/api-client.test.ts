import { describe, it, expect } from "vitest";
import { isRateLimitSafe } from "../src/github/api-client.js";
import type { RateLimitInfo } from "../src/github/api-client.js";

describe("api-client", () => {
  describe("isRateLimitSafe", () => {
    it("returns true when remaining > threshold", () => {
      const info: RateLimitInfo = { remaining: 500, limit: 5000, resetAt: "" };
      expect(isRateLimitSafe(info)).toBe(true);
    });

    it("returns false when remaining <= threshold", () => {
      const info: RateLimitInfo = { remaining: 50, limit: 5000, resetAt: "" };
      expect(isRateLimitSafe(info)).toBe(false);
    });

    it("accepts custom threshold", () => {
      const info: RateLimitInfo = { remaining: 50, limit: 5000, resetAt: "" };
      expect(isRateLimitSafe(info, 30)).toBe(true);
    });
  });
});
