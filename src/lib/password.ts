import { errorMessage } from "./utils";

export const MIN_PASSWORD_LENGTH = 8;
/** O Supabase usa bcrypt, que ignora tudo além de 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72;

/** Retorna a mensagem de erro para a nova senha, ou null se ela serve. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.trim().length === 0) return "Digite a nova senha.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (password !== confirm) return "As duas senhas não são iguais.";
  return null;
}

/** Traduz os erros do Supabase Auth para algo que o usuário entenda. */
export function passwordErrorMessage(err: unknown): string {
  const message = errorMessage(err);
  const lower = message.toLowerCase();
  if (lower.includes("different from the old password")) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (lower.includes("weak") || lower.includes("pwned") || lower.includes("easy to guess")) {
    return "Essa senha é fraca demais. Escolha outra, mais longa ou menos previsível.";
  }
  if (lower.includes("at least")) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (lower.includes("session missing") || lower.includes("expired") || lower.includes("invalid")) {
    return "O link expirou ou já foi usado. Peça um novo na tela de login.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  }
  return message || "Não foi possível concluir. Tente de novo.";
}
