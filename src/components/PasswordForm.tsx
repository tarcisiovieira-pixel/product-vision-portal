import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Lock } from "lucide-react";
import { MIN_PASSWORD_LENGTH, passwordErrorMessage, validateNewPassword } from "@/lib/password";

const fieldClass = "flex items-center border bg-background/50 px-3 focus-within:border-primary";
const inputClass = "w-full bg-transparent p-2 text-foreground focus:outline-none";

/**
 * Formulário de nova senha, usado na tela de redefinição e no diálogo de troca.
 * A regra de validação é a mesma nos dois lugares.
 */
export function PasswordForm({
  onSubmit,
  submitLabel,
}: {
  onSubmit: (password: string) => Promise<void>;
  submitLabel: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(passwordErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const type = visible ? "text" : "password";

  return (
    <form onSubmit={submit} className="space-y-4 font-mono text-xs" noValidate>
      <div>
        <label htmlFor="new-password" className="text-muted-foreground">
          NOVA SENHA
        </label>
        <div className={`mt-1.5 ${fieldClass}`}>
          <Lock className="h-4 w-4 text-muted-foreground" />
          <input
            id="new-password"
            type={type}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Mínimo de {MIN_PASSWORD_LENGTH} caracteres.
        </p>
      </div>

      <div>
        <label htmlFor="confirm-password" className="text-muted-foreground">
          CONFIRMAR NOVA SENHA
        </label>
        <div className={`mt-1.5 ${fieldClass}`}>
          <Lock className="h-4 w-4 text-muted-foreground" />
          <input
            id="confirm-password"
            type={type}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {visible ? "Ocultar senhas" : "Mostrar senhas"}
      </button>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[11px] leading-relaxed">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="cut-corner w-full bg-mars-gradient py-3 font-sans font-semibold uppercase tracking-widest text-primary-foreground shadow-glow disabled:opacity-50"
      >
        {loading ? "Salvando..." : submitLabel}
      </button>
    </form>
  );
}
