// Servidor que imita a API generateContent do Gemini, só para testar a integração de ponta a ponta
// sem gastar cota nem precisar de chave. Uso: node scripts/e2e/mock-gemini.mjs [porta]
// Aponte a API com GEMINI_BASE_URL=http://127.0.0.1:4010/v1beta e GEMINI_API_KEY=qualquer.
import http from "node:http";

const port = Number(process.argv[2] ?? 4010);
export const MOCK_REPLY = "Resposta simulada do Gemini: recomendo a primeira opção da lista.";

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.headers["x-goog-api-key"] !== "chave-de-teste") {
      res.writeHead(403).end(JSON.stringify({ error: { message: "chave inválida" } }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    const system = body.systemInstruction?.parts?.[0]?.text ?? "";
    let payload;
    if (system.includes("originCode")) {
      payload = {
        passengers: 2,
        cargoKg: null,
        days: 2,
        budget: null,
        originCode: null,
        destinationCode: null,
        offworld: false,
        priority: "comfort",
        luxury: true,
      };
    } else if (system.includes("priorities")) {
      payload = {
        summary: "Resumo simulado do Gemini: a ativação de novos cadastros é o ponto principal.",
        priorities: ["Revisar o e-mail de confirmação", "Ativar quem nunca reservou"],
      };
    } else {
      payload = { reply: MOCK_REPLY };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" },
        ],
      }),
    );
  });
});

server.listen(port, "127.0.0.1", () => console.log(`Gemini simulado em http://127.0.0.1:${port}`));
