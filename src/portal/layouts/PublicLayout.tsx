import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Wordmark } from "../../shared/ui/Wordmark";

export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <main className="portal-root portal-scope grid place-items-center px-4 py-10">
      <div className="grid w-full max-w-105 gap-6">
        <div className="flex justify-center">
          <Wordmark size={34} />
        </div>
        {children ?? <Outlet />}
      </div>
    </main>
  );
}
