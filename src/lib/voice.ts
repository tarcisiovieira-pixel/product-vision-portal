// Voz do copiloto: usa a fala e o reconhecimento de voz do próprio navegador (Web Speech API).
// Nada de serviço externo: o áudio não sai do aparelho por conta do app. Quando o navegador
// não suporta, os recursos de voz simplesmente não aparecem.

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechOutputSupported = () =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

export const speechInputSupported = () => recognitionCtor() !== null;

/** Tira o que atrapalha a leitura em voz alta (marcação, emojis, símbolos soltos). */
export function speakable(text: string): string {
  return text
    .replace(/[*_`#>|]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/MC\$/g, "créditos")
    .replace(/\bkm\/h\b/g, "quilômetros por hora")
    .replace(/\bkm\b/g, "quilômetros")
    .replace(/\bkPa\b/g, "quilopascais")
    .replace(/°/g, " graus")
    .replace(/%/g, " por cento")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function stopSpeaking(): void {
  if (speechOutputSupported()) window.speechSynthesis.cancel();
}

export function speak(text: string): void {
  if (!speechOutputSupported()) return;
  const clean = speakable(text);
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = "pt-BR";
  utterance.rate = 1.05;
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.toLowerCase().startsWith("pt"));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export interface Listening {
  stop(): void;
}

/** Escuta uma frase. Chama onText com a transcrição e onEnd ao terminar (com ou sem erro). */
export function listen(handlers: {
  onText: (text: string) => void;
  onEnd: () => void;
  onError?: (reason: string) => void;
}): Listening | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "pt-BR";
  rec.interimResults = false;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    const text = event.results[0]?.[0]?.transcript?.trim();
    if (text) handlers.onText(text);
  };
  rec.onerror = (event) => handlers.onError?.(event.error ?? "erro");
  rec.onend = () => handlers.onEnd();
  try {
    rec.start();
  } catch {
    handlers.onEnd();
    return null;
  }
  return { stop: () => rec.stop() };
}
