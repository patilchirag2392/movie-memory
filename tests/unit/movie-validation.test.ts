import { describe, expect, it } from "vitest";

import { parseMovieTitle } from "@/lib/validation/movie";

describe("parseMovieTitle (server-side onboarding validation)", () => {
  it("trims and collapses whitespace before storing", () => {
    expect(parseMovieTitle("  The   Matrix\n")).toEqual({ ok: true, title: "The Matrix" });
    expect(parseMovieTitle("Spirited\tAway")).toEqual({ ok: true, title: "Spirited Away" });
  });

  it("rejects empty and whitespace-only input", () => {
    expect(parseMovieTitle("")).toMatchObject({ ok: false });
    expect(parseMovieTitle("    ")).toMatchObject({ ok: false });
  });

  it("allows 100 characters and rejects 101 (counted after normalizing)", () => {
    expect(parseMovieTitle("a".repeat(100))).toMatchObject({ ok: true });
    expect(parseMovieTitle("a".repeat(101))).toMatchObject({ ok: false });
    expect(parseMovieTitle(`  ${"a".repeat(100)}  `)).toMatchObject({ ok: true });
  });

  it("rejects control characters such as NUL", () => {
    expect(parseMovieTitle("Bad\u0000Title")).toMatchObject({ ok: false });
  });

  it("rejects non-string input without throwing", () => {
    expect(parseMovieTitle(null)).toMatchObject({ ok: false });
    expect(parseMovieTitle(42)).toMatchObject({ ok: false });
  });
});
