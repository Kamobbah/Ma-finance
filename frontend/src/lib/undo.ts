import { toast } from "sonner";
import { undo } from "./store";

/** Notification avec bouton « Annuler » (restaure l'état précédent). */
export function toastUndo(message: string, description?: string) {
  toast.success(message, {
    description,
    duration: 7000,
    action: {
      label: "Annuler",
      onClick: () => {
        const label = undo();
        if (label) toast.info(`Annulé : ${label}`);
      },
    },
  });
}
