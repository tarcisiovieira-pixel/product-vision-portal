import { z } from "zod";

export const MAX_RENTAL_SOLS = 90;

export const idParams = z.object({ id: z.guid("ID inválido.") });

export const createRentalBody = z
  .strictObject({
    vehicleId: z.guid("Veículo inválido."),
    pickupHangarId: z.guid("Hangar de retirada inválido."),
    dropoffHangarId: z.guid("Hangar de devolução inválido."),
    startSol: z.number().int().positive(),
    endSol: z.number().int().positive(),
    silicaInsurance: z.boolean().default(false),
    extraO2Tank: z.boolean().default(false),
    neuralAutopilot: z.boolean().default(false),
    extraEvaSuits: z.number().int().min(0).max(6).default(0),
    stormBarrier: z.boolean().default(false),
  })
  .refine((b) => b.endSol > b.startSol, {
    path: ["endSol"],
    message: "O sol final deve ser maior que o inicial.",
  })
  .refine((b) => b.endSol - b.startSol <= MAX_RENTAL_SOLS, {
    path: ["endSol"],
    message: `A reserva pode ter no máximo ${MAX_RENTAL_SOLS} sols.`,
  });

export const extendRentalBody = z.strictObject({
  extraSols: z.number().int().min(1).max(30).default(1),
});
