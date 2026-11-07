import { Toaster as Sonner } from "sonner";

/** Portal toasts always show at the top-left. Colors come from KIT tokens. */
export function Toaster() {
  return (
    <Sonner
      position="top-left"
      closeButton
      richColors={false}
      toastOptions={{ duration: 4000 }}
      style={
        {
          "--normal-bg": "var(--color-elevated)",
          "--normal-text": "var(--color-text)",
          "--normal-border": "var(--color-border-strong)",
          "--success-bg": "var(--color-success-subtle)",
          "--success-text": "var(--color-success)",
          "--success-border": "var(--color-success)",
          "--error-bg": "var(--color-danger-subtle)",
          "--error-text": "var(--color-danger)",
          "--error-border": "var(--color-danger)",
          fontFamily: "var(--font-body)",
        } as React.CSSProperties
      }
    />
  );
}
