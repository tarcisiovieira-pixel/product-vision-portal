import type { FastifyInstance } from "fastify";
import type { UserDbFactory } from "../../lib/supabase.js";
import { createRentalBody, extendRentalBody, idParams } from "./schema.js";

export function rentalRoutes(db: UserDbFactory) {
  return async (app: FastifyInstance): Promise<void> => {
    const guard = { preHandler: app.authenticate };

    app.get("/v1/rentals", guard, async (req) => ({
      items: await db(req.user!.token).list("rentals", "created_at"),
    }));

    app.post("/v1/rentals", guard, async (req, reply) => {
      const b = createRentalBody.parse(req.body);
      const id = await db(req.user!.token).rpc("book_vehicle", {
        _vehicle_id: b.vehicleId,
        _pickup: b.pickupHangarId,
        _dropoff: b.dropoffHangarId,
        _start_sol: b.startSol,
        _end_sol: b.endSol,
        _silica_insurance: b.silicaInsurance,
        _extra_o2_tank: b.extraO2Tank,
        _neural_autopilot_l5: b.neuralAutopilot,
        _extra_eva_suits: b.extraEvaSuits,
        _storm_barrier: b.stormBarrier,
      });
      return reply.code(201).send({ id });
    });

    app.post("/v1/rentals/:id/extend", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const { extraSols } = extendRentalBody.parse(req.body ?? {});
      const endSol = await db(req.user!.token).rpc("extend_rental", {
        _rental_id: id,
        _extra_sols: extraSols,
      });
      return { endSol };
    });

    app.post("/v1/rentals/:id/cancel", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const refunded = await db(req.user!.token).rpc("cancel_rental", { _rental_id: id });
      return { refunded: Number(refunded) };
    });
  };
}
