import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UserDbFactory } from "../../lib/supabase.js";
import { idParams } from "../rentals/schema.js";

const listingBody = z.strictObject({
  name: z.string().trim().min(3).max(80),
  callsign: z.string().trim().min(3).max(30),
  category: z.enum(["car_vtol", "space_truck", "interplanetary_rocket"]),
  price: z.number().positive("O preço deve ser maior que zero.").max(100_000_000),
  hangarId: z.guid().nullable().default(null),
  flightHours: z.number().min(0).max(1_000_000).default(0),
  hullPct: z.number().int().min(0).max(100).default(100),
  batteryPct: z.number().int().min(0).max(100).default(100),
  condition: z
    .enum(["certified_preowned", "refurbished", "factory_new"])
    .default("certified_preowned"),
  features: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  sellerName: z.string().trim().max(60).default("Colono particular"),
});

export function marketplaceRoutes(db: UserDbFactory) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post("/v1/marketplace/listings", { preHandler: app.authenticate }, async (req, reply) => {
      const b = listingBody.parse(req.body);
      const id = await db(req.user!.token).rpc("create_listing", {
        _name: b.name,
        _callsign: b.callsign,
        _category: b.category,
        _price: b.price,
        _hangar_id: b.hangarId,
        _flight_hours: b.flightHours,
        _hull_pct: b.hullPct,
        _battery_pct: b.batteryPct,
        _condition: b.condition,
        _features: b.features,
        _seller_name: b.sellerName,
      });
      return reply.code(201).send({ id });
    });

    app.post(
      "/v1/marketplace/:id/purchase",
      { preHandler: app.authenticate },
      async (req, reply) => {
        const { id } = idParams.parse(req.params);
        const purchaseId = await db(req.user!.token).rpc("buy_marketplace_vehicle", {
          _sale_id: id,
        });
        return reply.code(201).send({ id: purchaseId });
      },
    );
  };
}
