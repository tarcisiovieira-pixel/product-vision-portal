import type { FastifyInstance } from "fastify";
import type { UserDbFactory } from "../../lib/supabase.js";
import { idParams } from "../rentals/schema.js";

export function marketplaceRoutes(db: UserDbFactory) {
  return async (app: FastifyInstance): Promise<void> => {
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
