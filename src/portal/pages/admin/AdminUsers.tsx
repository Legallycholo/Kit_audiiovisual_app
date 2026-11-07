import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState, PageHeader, Spinner } from "../../components/PageHeader";
import { Badge, accountTone, roleTone } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Select, Textarea } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useAuth } from "../../lib/auth";
import { dateTime, errorMessage, es } from "../../lib/es";
import {
  supabase,
  type AccountStatus,
  type AppRole,
  type Profile,
} from "../../lib/supabase";

type Row = Profile & { role: AppRole };
type Modal =
  | { kind: "role"; user: Row }
  | { kind: "status"; user: Row; next: Exclude<AccountStatus, "pending"> };

export function AdminUsers() {
  const { account } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [role, setRole] = useState<AppRole>("user");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(es.errors.generic);
    setRows((data as Row[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const open = (next: Modal) => {
    setReason("");
    if (next.kind === "role") setRole(next.user.role);
    setModal(next);
  };

  const apply = async () => {
    if (!modal) return;
    setBusy(true);
    const { error } =
      modal.kind === "role"
        ? await supabase.rpc("admin_set_role", {
            p_user_id: modal.user.id,
            p_role: role,
            p_reason: reason.trim() || null,
          })
        : await supabase.rpc("admin_set_account_status", {
            p_user_id: modal.user.id,
            p_status: modal.next,
            p_reason: reason.trim() || null,
          });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success(
      modal.kind === "role"
        ? "Rol actualizado."
        : "Estado de la cuenta actualizado.",
    );
    setModal(null);
    await load();
  };

  if (!rows) return <Spinner label={es.common.loading} />;
  const needsReason =
    modal?.kind === "status" &&
    (modal.next === "banned" || modal.next === "rejected");

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Roles y estado de todas las cuentas."
      />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <EmptyState title={es.common.empty} />
          ) : (
            <table className="w-full min-w-170 text-left text-sm">
              <thead className="border-b border-k-border text-k-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-3 py-3 font-medium">Rol</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Alta</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-k-border">
                {rows.map((row) => {
                  const self = row.id === account?.profile.id;
                  return (
                    <tr key={row.id}>
                      <td className="px-5 py-3">
                        <div className="font-medium">
                          {row.full_name ?? "—"}
                        </div>
                        <div className="text-k-muted">{row.email}</div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={roleTone[row.role]}>
                          {es.roles[row.role]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={accountTone[row.account_status]}>
                          {es.accountStatus[row.account_status]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-k-muted">
                        {dateTime(row.created_at)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => open({ kind: "role", user: row })}
                          >
                            Cambiar rol
                          </Button>
                          {!self && row.account_status === "active" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  open({
                                    kind: "status",
                                    user: row,
                                    next: "rejected",
                                  })
                                }
                              >
                                Rechazar
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  open({
                                    kind: "status",
                                    user: row,
                                    next: "banned",
                                  })
                                }
                              >
                                Bloquear
                              </Button>
                            </>
                          )}
                          {!self && row.account_status !== "active" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                open({
                                  kind: "status",
                                  user: row,
                                  next: "active",
                                })
                              }
                            >
                              Reactivar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={modal !== null}
        onOpenChange={(isOpen) => !isOpen && setModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.kind === "role"
                ? "Cambiar rol"
                : modal?.next === "banned"
                  ? "¿Bloquear a este usuario?"
                  : modal?.next === "rejected"
                    ? "¿Rechazar a este usuario?"
                    : "¿Reactivar esta cuenta?"}
            </DialogTitle>
            <DialogDescription>{modal?.user.email}</DialogDescription>
          </DialogHeader>
          {modal?.kind === "role" && (
            <div className="grid gap-1.5">
              <Label htmlFor="role">Rol</Label>
              <Select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as AppRole)}
              >
                {(["user", "admin"] as const).map((r) => (
                  <option key={r} value={r}>
                    {es.roles[r]}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="reason">
              {es.common.reason}
              {needsReason ? "" : ` (${es.common.optional})`}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button
              variant={
                modal?.kind === "status" && modal.next !== "active"
                  ? "destructive"
                  : "default"
              }
              disabled={busy || (needsReason && reason.trim().length === 0)}
              onClick={() => void apply()}
            >
              {es.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
