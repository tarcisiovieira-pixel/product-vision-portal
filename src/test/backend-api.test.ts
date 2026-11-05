import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../server/app";

describe("ARES Secure Backend API", () => {
  const app = createApp();

  it("GET /api/health returns operational status with active security parameters", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("operational");
    expect(res.body.system).toBe("ARES Mobility Core Backend");
    expect(res.body.solTime).toBe(4218);
    expect(res.body.security.rateLimiterActive).toBe(true);
    expect(res.body.security.helmetActive).toBe(true);
  });

  it("applies security headers (Helmet)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("GET /api/fleet/vehicles returns fleet catalog", async () => {
    const res = await request(app).get("/api/fleet/vehicles");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("callsign");
  });

  it("POST /api/auth/login validates required fields", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/obrigatórios/i);
  });

  it("POST /api/auth/login allows demo colonist authentication", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "demo@aresmobility.com",
      password: "DemoMars#2026",
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.profile.pilot_license).toBe("orbital");
  });

  it("GET /api/auth/verify checks Bearer token", async () => {
    const resNoToken = await request(app).get("/api/auth/verify");
    expect(resNoToken.status).toBe(401);

    const resValid = await request(app)
      .get("/api/auth/verify")
      .set("Authorization", "Bearer demo-jwt-martian-token-validated");
    expect(resValid.status).toBe(200);
    expect(resValid.body.authenticated).toBe(true);
  });

  it("POST /api/rentals/book validates pilot license vs vehicle category", async () => {
    // Tenta alugar um foguete orbital (v-ssh-01) com licença atmosférica
    const res = await request(app).post("/api/rentals/book").send({
      vehicle_id: "v-ssh-01",
      pickup_hangar_id: "h-oly-1",
      dropoff_hangar_id: "h-jez-1",
      start_sol: 4220,
      end_sol: 4225,
      user_license: "atmospheric", // insuficiente
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Habilitação insuficiente/i);
  });

  it("POST /api/rentals/book validates sol range (end > start)", async () => {
    const res = await request(app).post("/api/rentals/book").send({
      vehicle_id: "v-cc-01",
      pickup_hangar_id: "h-oly-1",
      dropoff_hangar_id: "h-jez-1",
      start_sol: 4225,
      end_sol: 4220, // inválido
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Período inválido/i);
  });

  it("POST /api/rentals/book confirms valid reservation with quantum key", async () => {
    const res = await request(app).post("/api/rentals/book").send({
      vehicle_id: "v-cc-01",
      pickup_hangar_id: "h-oly-1",
      dropoff_hangar_id: "h-jez-1",
      start_sol: 4220,
      end_sol: 4224,
      silica_insurance: true,
      user_license: "atmospheric",
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.quantumKey).toMatch(/^Q-KEY#/);
    expect(res.body.totalCredits).toBeGreaterThan(0);
  });
});
