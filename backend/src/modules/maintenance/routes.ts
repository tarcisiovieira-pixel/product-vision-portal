import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UserDbFactory } from "../../lib/supabase.js";

export const SERVICE_TYPES = [
  "silica_clean",
  "cryo_recharge",
  "heat_shield_repair",
  "o2_refill",
  "thruster_calibration",
] as const;

const body = z.strictObject({
  vehicleId: z.guid("Veículo inválido."),
  serviceType: z.enum(SERVICE_TYPES, "Serviço inválido."),
  notes: z.string().trim().max(500).optional(),
});

export function maintenanceRoutes(db: UserDbFactory) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post("/v1/maintenance", { preHandler: app.authenticate }, async (req, reply) => {
      const b = body.parse(req.body);
      const result = await db(req.user!.token).rpc("execute_maintenance", {
        _vehicle_id: b.vehicleId,
        _service_type: b.serviceType,
        _notes: b.notes ?? null,
      });
      return reply.code(201).send({ result });
    });
  };
}
