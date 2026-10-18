import { useEffect, useState } from "react";
import { Wordmark } from "../shared/ui";

/**
 * Shown while the company session is restored. It appears only after 150 ms,
 * so fast loads skip it; the three lights merge into the dot of the i once.
 */
export function BootScreen() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timeout);
  }, []);
  return (
    <main className="boot-screen" aria-busy="true">
      {visible && (
        <div className="boot-mark">
          <Wordmark size={64} merge slogan />
          <p role="status">Conectando con tu empresa…</p>
        </div>
      )}
    </main>
  );
}
