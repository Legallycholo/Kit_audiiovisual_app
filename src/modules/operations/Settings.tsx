import { UserManagement } from "../UserManagement";
import { useEffect, useState } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { AppearanceSettings } from "../settings/Appearance";
import { IntegrationsSettings } from "../settings/Integrations";
import { visibleSettingsSections } from "../../application/navigation";
import { openCompanyWorkspace } from "../../application/Sidebar";
import {
  Download,
  FileUp,
  FlaskConical,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useWorkspace, activity } from "../../shared/store";
import {
  Badge,
  Button,
  Field,
  Modal,
  PageHeader,
  Panel,
  Switch,
} from "../../shared/ui";
import { uiLabel } from "../../shared/i18n";
import { downloadFile, id, initials } from "../../shared/domain";
import type { Workspace } from "../../shared/types";

export function SettingsPage() {
  const {
    data,
    update,
    toast,
    reset,
    mode,
    user,
    request,
    refresh,
    sync,
    openCompany,
    openDemo,
  } = useWorkspace();
  const { section } = useParams();
  const sections = visibleSettingsSections(user, mode);
  const tab = sections.some((item) => item.id === section)
    ? (section as string)
    : "";
  const [settings, setSettings] = useState({ ...data.settings });
  const [resetting, setResetting] = useState(false);
  type BackupPreview = {
    backup: {
      exportedAt: string;
      sourceRevision: number;
      checksum: string;
      company: string;
      counts: Record<string, number>;
    };
    current: { company: string; revision: number };
    confirmation: string;
  };
  type RecoveryPoint = {
    id: string;
    createdAt: string;
    previousRevision: number;
    restoredRevision: number;
  };
  const [selectedBackup, setSelectedBackup] = useState<unknown>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(
    null,
  );
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const [rollbackPoint, setRollbackPoint] = useState<RecoveryPoint | null>(
    null,
  );
  const [rollbackConfirmation, setRollbackConfirmation] = useState("");
  const [dataAction, setDataAction] = useState(false);
  const loadRecoveryPoints = async () => {
    const result = await request<{
      recoveryPoints: RecoveryPoint[];
      currentRevision: number;
    }>("/backup/recovery-points");
    setRecoveryPoints(result.recoveryPoints);
    setRecoveryRevision(result.currentRevision);
  };
  useEffect(() => {
    if (mode !== "company" || user?.role !== "Administrator" || tab !== "data")
      return;
    void loadRecoveryPoints().catch((error) => toast((error as Error).message));
  }, [mode, user?.role, tab]);
  if (!tab) return <Navigate to={sections[0].to} replace />;
  const admin = !(mode === "company" && user?.role !== "Administrator");
  return (
    <>
      <PageHeader
        title={admin ? "Settings" : "Mi cuenta"}
        description={
          admin
            ? "Company, people, connections, appearance and data in one place."
            : undefined
        }
      />
      <div className="settings-workspace">
        <nav className="settings-nav" aria-label={uiLabel("Settings sections")}>
          {sections.map((item) => (
            <NavLink key={item.id} to={item.to}>
              {uiLabel(item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="settings-content">
          {tab === "appearance" && <AppearanceSettings />}
          {tab === "users" && !admin && <UserManagement />}
          {tab === "general" && (
            <Panel
              title="Company profile"
              subtitle="The identity shown across your workspace."
            >
              <form
                className="panel-body"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!(await update((s) => ({ ...s, settings })))) return;
                  toast("Company preferences saved.");
                }}
              >
                <div className="company-monogram">
                  {initials(settings.company)}
                </div>
                <Field label="Company name">
                  <input
                    required
                    value={settings.company}
                    onChange={(e) =>
                      setSettings({ ...settings, company: e.target.value })
                    }
                  />
                </Field>
                <Field label="Company email">
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) =>
                      setSettings({ ...settings, email: e.target.value })
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Currency">
                    <select value={settings.currency} disabled>
                      <option>USD</option>
                    </select>
                  </Field>
                  <Field label="Default event time zone">
                    <select
                      value={settings.timezone}
                      onChange={(e) =>
                        setSettings({ ...settings, timezone: e.target.value })
                      }
                    >
                      {[
                        "America/Puerto_Rico",
                        "America/New_York",
                        "America/Chicago",
                        "America/Los_Angeles",
                        "UTC",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button>
                  <Save size={16} />
                  Save company profile
                </Button>
              </form>
            </Panel>
          )}
          {tab === "users" && admin && mode === "company" && <UserManagement />}
          {tab === "users" && mode === "sample" && (
            <Panel
              title="Users & roles"
              subtitle="The permission model is defined; authentication is not connected in this local workspace."
            >
              <div className="panel-body">
                <div className="info-note">
                  {uiLabel(
                    "Access is enforced by the company server on every request. Create accounts in the company workspace.",
                  )}
                </div>
                {[
                  [
                    "Propietario / administrador",
                    "Administra la empresa, confirma mensajes salientes y revisa cada aceptación.",
                  ],
                  [
                    "Ventas",
                    "Clientes, oportunidades, propuestas editables y borradores de mensajes.",
                  ],
                  [
                    "Diseño de eventos",
                    "Planos del lugar, versiones de diseño y recursos creativos.",
                  ],
                  [
                    "Producción",
                    "Equipo humano, reservas de equipos, tareas de producción y entregas.",
                  ],
                  [
                    "Técnico",
                    "Tareas asignadas, planes publicados y custodia de equipos.",
                  ],
                  [
                    "Cliente / invitado",
                    "Solo las versiones de propuestas y la información de eventos que se le compartan.",
                  ],
                ].map(([name, description]) => (
                  <div className="role-row" key={name}>
                    <ShieldCheck size={20} />
                    <div>
                      <strong>{name}</strong>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "integrations" && <IntegrationsSettings />}
          {tab === "general" && (
            <Panel title="Notification preferences">
              <div className="panel-body">
                <Switch
                  label="Review reminders"
                  description="Shows a dot on the bell and a count on Messages when a client reply is waiting for review."
                  checked={data.settings.notifications}
                  onChange={async (checked) => {
                    if (
                      !(await update((s) => ({
                        ...s,
                        settings: {
                          ...s.settings,
                          notifications: checked,
                        },
                      })))
                    )
                      return;
                    toast("Notification preference saved.");
                  }}
                />
                <div className="role-row">
                  <ShieldCheck size={20} aria-hidden="true" />
                  <div>
                    <strong>
                      {uiLabel("Owner confirms every client acceptance")}
                    </strong>
                    <p>
                      {uiLabel(
                        "A client's reply never marks an offer accepted on its own. The owner reviews the message and the exact offer first.",
                      )}
                    </p>
                  </div>
                  <Badge tone="green">{uiLabel("Always on")}</Badge>
                </div>
              </div>
            </Panel>
          )}
          {tab === "integrations" && (
            <Panel title="AI controls">
              <div className="panel-body">
                <div className="role-row">
                  <ShieldCheck size={23} />
                  <div>
                    <strong>
                      {uiLabel("Owner confirms every outgoing message")}
                    </strong>
                    <p>
                      {uiLabel(
                        "No autonomous replies, price negotiations, or acceptance decisions.",
                      )}
                    </p>
                  </div>
                  <Badge tone="green">{uiLabel("Always on")}</Badge>
                </div>
              </div>
            </Panel>
          )}
          {tab === "general" && (
            <Panel title="Commercial defaults">
              <div className="panel-body">
                <p>
                  Las tarifas diarias salen del catálogo de equipos y se copian
                  en cada versión de la propuesta. Los descuentos se aplican
                  antes de impuestos. Todos los importes están en USD.
                </p>
                <div className="info-note">
                  Confirma con la empresa los periodos de alquiler, el redondeo,
                  los impuestos, los depósitos y la vigencia antes de enviar
                  propuestas reales.
                </div>
              </div>
            </Panel>
          )}
          {tab === "general" && (
            <Panel title="Event defaults">
              <div className="panel-body">
                <div className="detail-facts">
                  <div>
                    <span>Default time zone</span>
                    <strong>{data.settings.timezone}</strong>
                  </div>
                  <div>
                    <span>{uiLabel("Design units")}</span>
                    <strong>Meters · initial workspace</strong>
                  </div>
                  <div>
                    <span>Starting status</span>
                    <strong>{uiLabel("Planning")}</strong>
                  </div>
                </div>
              </div>
            </Panel>
          )}
          {tab === "data" && mode === "company" && (
            <Panel
              title="Copia y recuperación de la empresa"
              subtitle="Flujo exclusivo para administradores; no incluye contraseñas, sesiones ni el historial de auditoría."
            >
              <div className="panel-body">
                <p>
                  Descarga una copia versionada de los registros compartidos. El
                  archivo incluye una suma de verificación para detectar
                  contenido incompleto o modificado.
                </p>
                <Button
                  disabled={dataAction}
                  onClick={async () => {
                    try {
                      setDataAction(true);
                      const exported = await request("/backup");
                      downloadFile(
                        `kit-company-backup-${new Date().toISOString().slice(0, 10)}.json`,
                        JSON.stringify(exported, null, 2),
                      );
                    } catch (e) {
                      toast((e as Error).message);
                    } finally {
                      setDataAction(false);
                    }
                  }}
                >
                  <Download size={16} />
                  Descargar copia verificada
                </Button>
                <hr />
                <h3>Restaurar desde una copia</h3>
                <p>
                  Primero se valida y resume el archivo. Antes de reemplazar
                  registros, el servidor crea automáticamente un punto de
                  recuperación de la versión actual.
                </p>
                {sync.pending && (
                  <div className="info-note">
                    Resuelve el guardado pendiente antes de iniciar una
                    restauración.
                  </div>
                )}
                <label
                  className="button secondary"
                  aria-disabled={dataAction || Boolean(sync.pending)}
                >
                  <FileUp size={16} />
                  Seleccionar copia para revisar
                  <input
                    className="visually-hidden"
                    type="file"
                    accept="application/json,.json"
                    disabled={dataAction || Boolean(sync.pending)}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (file.size > 5_500_000) {
                        toast("La copia supera el límite permitido de 5.5 MB.");
                        return;
                      }
                      try {
                        setDataAction(true);
                        const parsed = JSON.parse(await file.text()) as unknown;
                        const preview = await request<BackupPreview>(
                          "/backup/preview",
                          { method: "POST", body: { backup: parsed } },
                        );
                        setSelectedBackup(parsed);
                        setBackupPreview(preview);
                        setRestoreConfirmation("");
                      } catch (error) {
                        setSelectedBackup(null);
                        setBackupPreview(null);
                        toast((error as Error).message);
                      } finally {
                        setDataAction(false);
                      }
                    }}
                  />
                </label>
                <hr />
                <h3>Puntos de recuperación recientes</h3>
                <p>
                  Se conservan las diez versiones previas creadas por
                  restauraciones. Cada reversión genera primero otro punto de
                  seguridad.
                </p>
                {recoveryPoints.length ? (
                  <div className="recovery-list">
                    {recoveryPoints.map((point) => (
                      <div className="role-row" key={point.id}>
                        <ShieldCheck size={20} />
                        <div>
                          <strong>
                            Revisión {point.previousRevision} protegida
                          </strong>
                          <p>{new Date(point.createdAt).toLocaleString()}</p>
                        </div>
                        <Button
                          variant="secondary"
                          disabled={dataAction || Boolean(sync.pending)}
                          onClick={() => {
                            setRollbackPoint(point);
                            setRollbackConfirmation("");
                          }}
                        >
                          Recuperar
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="info-note">
                    Todavía no se han creado puntos de recuperación.
                  </div>
                )}
              </div>
            </Panel>
          )}
          {tab === "data" && mode === "sample" && (
            <Panel title="Your local workspace">
              <div className="panel-body">
                <p>
                  La demostración guarda los cambios solo en este navegador. No
                  hay almacenamiento compartido, cuentas ni copias de seguridad
                  de empresa.
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadFile(
                      "kit-workspace-backup.json",
                      JSON.stringify(data, null, 2),
                    )
                  }
                >
                  <Download size={16} />
                  Exportar copia local
                </Button>
                <hr />
                <h3>Restablecer la demostración</h3>
                <p>
                  Reemplaza tus cambios con los clientes, eventos y propuestas
                  de ejemplo originales.
                </p>
                <Button variant="danger" onClick={() => setResetting(true)}>
                  Restablecer datos de ejemplo
                </Button>
              </div>
            </Panel>
          )}
          {tab === "data" && (
            <Panel
              title="Workspace activity"
              subtitle={
                mode === "sample"
                  ? "Historial de ejemplo en este dispositivo."
                  : "Historial registrado por el servidor; los clientes no pueden modificarlo."
              }
            >
              <div className="activity-list">
                {data.activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.detail}</p>
                      <small>{new Date(a.at).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "data" && admin && (
            <Panel
              title="Demo workspace"
              subtitle="Sample clients and events for practice. They never mix with company records."
            >
              <div className="panel-body">
                <p>
                  {uiLabel(
                    mode === "sample"
                      ? "You are viewing sample data saved only on this device."
                      : "Opens a separate space with sample data. Your company records do not change.",
                  )}
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    mode === "sample"
                      ? void openCompanyWorkspace(openCompany, toast)
                      : openDemo()
                  }
                >
                  <FlaskConical size={16} />
                  {uiLabel(
                    mode === "sample"
                      ? "Leave the demo workspace"
                      : "Open the demo workspace",
                  )}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>
      {resetting && (
        <Modal
          title="Restore sample data?"
          description="This replaces changes saved in this browser. Export a backup first if you want to keep them."
          onClose={() => setResetting(false)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setResetting(false)}>
              Keep my changes
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setSettings({ ...data.settings });
                setResetting(false);
              }}
            >
              Replace with sample data
            </Button>
          </div>
        </Modal>
      )}
      {backupPreview && selectedBackup !== null && (
        <Modal
          title="Confirmar restauración de empresa"
          description="La operación reemplaza todos los registros compartidos, pero conserva cuentas, sesiones y auditoría."
          onClose={() => {
            setBackupPreview(null);
            setSelectedBackup(null);
          }}
        >
          <div className="modal-body">
            <div className="detail-facts">
              <div>
                <span>Empresa en la copia</span>
                <strong>{backupPreview.backup.company}</strong>
              </div>
              <div>
                <span>Exportada</span>
                <strong>
                  {new Date(backupPreview.backup.exportedAt).toLocaleString()}
                </strong>
              </div>
              <div>
                <span>Revisión de origen</span>
                <strong>{backupPreview.backup.sourceRevision}</strong>
              </div>
            </div>
            <p>
              Contenido: {backupPreview.backup.counts.projects} proyectos,{" "}
              {backupPreview.backup.counts.clients} clientes,{" "}
              {backupPreview.backup.counts.proposals} propuestas y{" "}
              {backupPreview.backup.counts.layouts} diseños.
            </p>
            {backupPreview.current.company !== backupPreview.backup.company && (
              <div className="error-note" role="alert">
                La copia pertenece a “{backupPreview.backup.company}”, pero el
                espacio actual se llama “{backupPreview.current.company}”.
              </div>
            )}
            <Field
              label={`Escribe ${backupPreview.confirmation} para confirmar`}
            >
              <input
                autoComplete="off"
                value={restoreConfirmation}
                onChange={(event) => setRestoreConfirmation(event.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <Button
                variant="secondary"
                disabled={dataAction}
                onClick={() => {
                  setBackupPreview(null);
                  setSelectedBackup(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={
                  dataAction ||
                  restoreConfirmation !== backupPreview.confirmation
                }
                onClick={async () => {
                  try {
                    setDataAction(true);
                    await request("/backup/restore", {
                      method: "POST",
                      body: {
                        backup: selectedBackup,
                        expectedRevision: backupPreview.current.revision,
                        confirmation: restoreConfirmation,
                      },
                    });
                    setBackupPreview(null);
                    setSelectedBackup(null);
                    await refresh();
                    await loadRecoveryPoints();
                    toast(
                      "Copia restaurada. La versión anterior quedó protegida como punto de recuperación.",
                    );
                  } catch (error) {
                    toast((error as Error).message);
                  } finally {
                    setDataAction(false);
                  }
                }}
              >
                Restaurar registros
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {rollbackPoint && (
        <Modal
          title="Recuperar versión anterior"
          description={`Se reemplazarán los registros actuales con la revisión ${rollbackPoint.previousRevision}.`}
          onClose={() => setRollbackPoint(null)}
        >
          <div className="modal-body">
            <p>
              El estado actual también se guardará como un nuevo punto de
              seguridad antes de continuar.
            </p>
            <Field label="Escribe ROLL BACK para confirmar">
              <input
                autoComplete="off"
                value={rollbackConfirmation}
                onChange={(event) =>
                  setRollbackConfirmation(event.target.value)
                }
              />
            </Field>
            <div className="modal-actions">
              <Button
                variant="secondary"
                disabled={dataAction}
                onClick={() => setRollbackPoint(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={dataAction || rollbackConfirmation !== "ROLL BACK"}
                onClick={async () => {
                  try {
                    setDataAction(true);
                    await request(
                      `/backup/recovery-points/${rollbackPoint.id}/restore`,
                      {
                        method: "POST",
                        body: {
                          expectedRevision: recoveryRevision,
                          confirmation: rollbackConfirmation,
                        },
                      },
                    );
                    setRollbackPoint(null);
                    await refresh();
                    await loadRecoveryPoints();
                    toast("Versión anterior recuperada.");
                  } catch (error) {
                    toast((error as Error).message);
                  } finally {
                    setDataAction(false);
                  }
                }}
              >
                Recuperar revisión
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
