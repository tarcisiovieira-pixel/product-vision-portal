import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { UserDbFactory } from "../../lib/supabase.js";
import { idParams } from "../rentals/schema.js";

const reason = z.string().trim().min(3, "Informe o motivo.").max(300);

const creditsBody = z.strictObject({
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, "O ajuste não pode ser zero.")
    .refine((n) => Math.abs(n) <= 1_000_000, "Ajuste máximo de MC$ 1.000.000."),
  reason,
});

const licenseBody = z.strictObject({
  license: z.enum(["atmospheric", "heavy_cargo", "orbital"], "Habilitação inválida."),
  reason,
});

const suspensionBody = z.strictObject({ suspended: z.boolean(), reason });

const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/** A permissão é validada pelas funções do banco: quem não é admin recebe 403. */
export function adminRoutes(db: UserDbFactory) {
  return async (app: FastifyInstance): Promise<void> => {
    const guard = { preHandler: app.authenticate };

    app.get("/v1/admin/overview", guard, (req) => db(req.user!.token).rpc("admin_overview", {}));

    app.get("/v1/admin/users", guard, async (req) => ({
      items: await db(req.user!.token).rpc("admin_list_users", {}),
    }));

    app.get("/v1/admin/audit", guard, async (req) => {
      const { limit } = auditQuery.parse(req.query);
      return { items: await db(req.user!.token).rpc("admin_list_audit", { _limit: limit }) };
    });

    app.post("/v1/admin/users/:id/credits", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const b = creditsBody.parse(req.body);
      const balance = await db(req.user!.token).rpc("admin_adjust_credits", {
        _user_id: id,
        _delta: b.delta,
        _reason: b.reason,
      });
      return { balance: Number(balance) };
    });

    app.post("/v1/admin/users/:id/license", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const b = licenseBody.parse(req.body);
      await db(req.user!.token).rpc("admin_set_license", {
        _user_id: id,
        _license: b.license,
        _reason: b.reason,
      });
      return { ok: true };
    });

    app.post("/v1/admin/users/:id/suspension", guard, async (req) => {
      const { id } = idParams.parse(req.params);
      const b = suspensionBody.parse(req.body);
      await db(req.user!.token).rpc("admin_set_suspended", {
        _user_id: id,
        _suspended: b.suspended,
        _reason: b.reason,
      });
      return { ok: true };
    });
  };
}
