import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function registerErrors(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: "not_found", message: "Rota não encontrada." }),
  );

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Dados inválidos.",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, "unhandled error");
      return reply.code(500).send({ error: "internal_error", message: "Erro interno." });
    }
    return reply.code(status).send({ error: "request_error", message: (err as Error).message });
  });
}
