import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

describe("App routing", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("matches landing page route '/'", () => {
    const matches = router.matchRoutes("/");
    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    expect(matches.some((m) => m.routeId === "/")).toBe(true);
  });

  it("matches '/login' terminal route", () => {
    const matches = router.matchRoutes("/login");
    expect(matches.at(-1)?.routeId).toBe("/login");
  });

  it("matches legacy '/painel' route", () => {
    const matches = router.matchRoutes("/painel");
    expect(matches.at(-1)?.routeId).toBe("/painel");
  });

  it("matches authenticated '/app/booking' route", () => {
    const matches = router.matchRoutes("/app/booking");
    expect(matches.at(-1)?.routeId).toBe("/app/booking");
  });

  it("matches authenticated '/app/hangar-3d' route", () => {
    const matches = router.matchRoutes("/app/hangar-3d");
    expect(matches.at(-1)?.routeId).toBe("/app/hangar-3d");
  });

  it("matches authenticated '/app/mars-radar' route", () => {
    const matches = router.matchRoutes("/app/mars-radar");
    expect(matches.at(-1)?.routeId).toBe("/app/mars-radar");
  });

  it("matches authenticated '/app/maintenance' route", () => {
    const matches = router.matchRoutes("/app/maintenance");
    expect(matches.at(-1)?.routeId).toBe("/app/maintenance");
  });
});
