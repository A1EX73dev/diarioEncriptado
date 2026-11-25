import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "./icons";

interface AlertProps {
  tone: "error" | "success" | "info";
  children: ReactNode;
}

const TONES = {
  error: { box: "border-danger bg-danger-surface text-danger", Icon: AlertIcon, label: "Error:" },
  success: { box: "border-success bg-success-surface text-success", Icon: CheckIcon, label: "Hecho:" },
  info: { box: "border-border-strong bg-surface-sunken text-text", Icon: AlertIcon, label: "Aviso:" },
} as const;

/**
 * Mensaje de estado. El tono no depende solo del color: lleva icono y una
 * etiqueta para lectores de pantalla. Los errores se anuncian de inmediato.
 */
export function Alert({ tone, children }: AlertProps) {
  const { box, Icon, label } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      // Enfocable por código (no con Tab) para llevar el foco al error tras enviar un formulario.
      tabIndex={tone === "error" ? -1 : undefined}
      className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm ${box}`}
    >
      <Icon className="mt-px shrink-0" />
      <p>
        <span className="sr-only">{label} </span>
        {children}
      </p>
    </div>
  );
}
