import type { FastifyInstance } from "fastify";

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me", { preHandler: app.authenticate }, async (req) => {
    const { id, email } = req.user!;
    return { id, email };
  });
}
