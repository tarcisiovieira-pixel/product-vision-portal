import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UserDbFactory } from "../../lib/supabase.js";
import { CALLSIGN_PATTERN, MODEL_KEYS, normalizeCallsign } from "../../lib/shared.js";
import { idParams } from "../rentals/schema.js";

const reason = z.string().trim().min(3, "Informe o motivo.").max(300);

const vehicleBody = z.strictObject({
  name: z.string().trim().min(3, "O nome precisa de ao menos 3 caracteres.").max(80),
  callsign: z
    .string()
    .transform(normalizeCallsign)
    .pipe(z.string().regex(CALLSIGN_PATTERN, "Use de 3 a 20 letras maiúsculas, números ou hífen.")),
  modelKey: z.enum(MODEL_KEYS, "Modelo 3D inválido."),
  dailyRate: z.number().positive("A diária deve ser maior que zero.").max(1_000_000),
  hangarId: z.guid("Hangar inválido.").nullable(),
  status: z.enum(["available", "in_flight", "maintenance", "storm_hold"], "Status inválido."),
  seats: z.number().int().min(1).max(500),
  cargoKg: z.number().int().min(0).max(10_000_000),
  rangeKm: z.number().int().min(1).max(1_000_000_000),
  description: z.string().trim().max(400).nullable().default(null),
  reason,
});

const reasonBody = z.strictObject({ reason });

type VehicleBody = z.infer<typeof vehicleBody>;

const saveArgs = (id: string | null, b: VehicleBody) => ({
  _id: id,
  _name: b.name,
  _callsign: b.callsign,
  _model_key: b.modelKey,
  _daily_rate: b.dailyRate,
  _hangar_id: b.hangarId,
  _status: b.status,
  _seats: b.seats,
  _cargo_kg: b.cargoKg,
  _range_km: b.rangeKm,
  _description: b.description,
  _reason: b.reason,
});

/** CRUD da frota. A permissão de administrador é verificada pelas funções do banco. */
export function adminVehicleRoutes(db: UserDbFactory) {
  return async (app: FastifyInstance): Promise<void> => {
    const guard = { preHandler: app.authenticate };

    app.get("/v1/admin/vehicles", guard, async (req) => ({
      items: await db(req.user!.token).rpc("admin_list_vehicles", {}),
    }));

    app.post("/v1/admin/vehicles", guard, async (req, reply) => {
      const b = vehicleBody.parse(req.body);
      const id = await db(req.user!.token).rpc("admin_save_vehicle", saveArgs(null, b));
      return reply.code(201).send({ id });
    });

    app.put("/v1/admin/vehicles/:id", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const b = vehicleBody.parse(req.body);
      await db(req.user!.token).rpc("admin_save_vehicle", saveArgs(id, b));
      return { id };
    });

    app.post("/v1/admin/vehicles/:id/archive", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const b = reasonBody.parse(req.body);
      await db(req.user!.token).rpc("admin_archive_vehicle", { _id: id, _reason: b.reason });
      return { ok: true };
    });

    app.post("/v1/admin/vehicles/:id/restore", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const b = reasonBody.parse(req.body);
      await db(req.user!.token).rpc("admin_restore_vehicle", { _id: id, _reason: b.reason });
      return { ok: true };
    });
  };
}
