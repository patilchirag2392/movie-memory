import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

const request = (path: string, cookie?: string) =>
  new NextRequest(`https://movie-memory.example${path}`, {
    headers: cookie ? { cookie } : {},
  });

describe("proxy (optimistic session-cookie check)", () => {
  it("only runs on the signed-in pages", () => {
    expect(config.matcher).toEqual(["/dashboard", "/onboarding"]);
  });

  it.each(["/dashboard", "/onboarding"])("sends a real 307 to / from %s without a session cookie", (path) => {
    const res = proxy(request(path));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://movie-memory.example/");
  });

  it("ignores unrelated cookies", () => {
    expect(proxy(request("/dashboard", "theme=dark")).status).toBe(307);
  });

  it.each(["authjs.session-token", "__Secure-authjs.session-token"])(
    "lets the request through when %s is present (the page then verifies it)",
    (name) => {
      const res = proxy(request("/dashboard", `${name}=anything`));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    },
  );
});
