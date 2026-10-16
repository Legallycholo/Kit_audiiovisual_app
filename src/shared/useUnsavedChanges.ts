import { useEffect } from "react";

/** Protect local drafts from accidental reloads and ordinary internal link navigation. */
export const draftGuard: {
  dirty: boolean;
  save?: () => Promise<unknown>;
  discard?: () => void;
} = {
  dirty: false,
};
export function useUnsavedChanges(
  dirty: boolean,
  save?: () => Promise<unknown>,
  discard?: () => void,
) {
  useEffect(() => {
    draftGuard.dirty = dirty;
    draftGuard.save = save;
    draftGuard.discard = discard;
    window.dispatchEvent(new CustomEvent("kit:dirty", { detail: dirty }));
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("beforeunload", unload);
      draftGuard.dirty = false;
      draftGuard.save = undefined;
      draftGuard.discard = undefined;
      window.dispatchEvent(new CustomEvent("kit:dirty", { detail: false }));
    };
  }, [dirty, save, discard]);
}
