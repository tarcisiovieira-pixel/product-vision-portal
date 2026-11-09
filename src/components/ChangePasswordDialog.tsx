import { toast } from "sonner";
import { PasswordForm } from "@/components/PasswordForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const save = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    toast.success("Senha alterada", { description: "Use a nova senha no próximo acesso." });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-surface sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Alterar senha</DialogTitle>
        </DialogHeader>
        <PasswordForm onSubmit={save} submitLabel="Salvar nova senha" />
      </DialogContent>
    </Dialog>
  );
}
