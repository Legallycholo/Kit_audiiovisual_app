import { UserManagement } from "../UserManagement";
import { useEffect, useState } from "react";
import { Box, Download, FileUp, Save, ShieldCheck, Users } from "lucide-react";
import { useWorkspace, activity } from "../../shared/store";
import {
  Badge,
  Button,
  Field,
  Modal,
  PageHeader,
  Panel,
  Placeholder,
} from "../../shared/ui";
import { downloadFile, id, initials } from "../../shared/domain";
import type { Workspace } from "../../shared/types";

export function SettingsPage() {
  const { data, update, toast, reset, mode, user, request, refresh, sync } =
    useWorkspace();
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (mode === "company" && user?.role === "Administrator")
      request<{ configured: boolean }>("/ai/status")
        .then((result) => {
          if (active) setAiConfigured(result.configured);
        })
        .catch(() => {
          if (active) setAiConfigured(null);
        });
    return () => {
      active = false;
    };
  }, [mode, user?.role, request]);
  const [tab, setTab] = useState("Company profile");
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
    if (
      mode !== "company" ||
      user?.role !== "Administrator" ||
      tab !== "Workspace data"
    )
      return;
    void loadRecoveryPoints().catch((error) => toast((error as Error).message));
  }, [mode, user?.role, tab]);
  if (mode === "company" && user?.role !== "Administrator")
    return (
      <>
        <PageHeader title="Mi cuenta" />
        <UserManagement />
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="MAKE THE WORKSPACE YOURS"
        title="Settings"
        description="Your company, your preferences, and the way your team works."
      />
      <div className="settings-workspace">
        <aside className="settings-nav">
          {[
            "Company profile",
            "Users & roles",
            "Proposal preferences",
            "Event preferences",
            "Notifications",
            "AI preferences",
            "Integrations",
            "Activity history",
            "Workspace data",
          ].map((item) => (
            <button
              key={item}
              className={item === tab ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </aside>
        <div>
          {tab === "Company profile" && (
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
          {tab === "Users & roles" && mode === "company" && <UserManagement />}
          {tab === "Users & roles" && mode === "sample" && (
            <Panel
              title="Users & roles"
              subtitle="The permission model is defined; authentication is not connected in this local workspace."
            >
              <div className="panel-body">
                <div className="info-note">
                  You are previewing the owner workspace with sample data. These
                  role descriptions do not enforce access controls yet.
                </div>
                {[
                  [
                    "Administrator / owner",
                    "Company administration, outgoing message confirmation, and final acceptance review.",
                  ],
                  [
                    "Sales Manager",
                    "Clients, opportunities, editable proposals, and message drafts.",
                  ],
                  [
                    "Event Designer",
                    "Venue layouts, design revisions, and creative assets.",
                  ],
                  [
                    "Production Manager",
                    "Crew, equipment reservations, production tasks, and fulfillment.",
                  ],
                  [
                    "Technician",
                    "Assigned tasks, published plans, and equipment custody updates.",
                  ],
                  [
                    "Client / Guest",
                    "Only explicitly shared proposal revisions and event information.",
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
          {tab === "Integrations" && (
            <Panel
              title="Connections"
              subtitle="Services connect here when credentials and business policies are ready."
            >
              <div className="panel-body">
                {[
                  [
                    "WhatsApp / Meta",
                    "Inbound and outbound client messages, with owner approval before every send.",
                  ],
                  [
                    "Redacción de propuestas con IA",
                    "Sugerencias editables con equipos y tarifas del catálogo. El asistente general se conecta por separado.",
                  ],
                  [
                    "Creative generation",
                    "Images, editing, and later video generation.",
                  ],
                  [
                    "Cuentas y registros de empresa",
                    "Acceso por rol y registros compartidos en el servidor. Los archivos adjuntos se incorporarán después.",
                  ],
                ].map(([name, description]) => (
                  <div className="integration-row" key={name}>
                    <span className="integration-icon">
                      <Box size={22} />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <p>{description}</p>
                    </div>
                    <Badge tone="neutral">
                      {name === "Cuentas y registros de empresa" &&
                      mode === "company"
                        ? "Conectado"
                        : name === "Redacción de propuestas con IA" &&
                            mode === "company"
                          ? aiConfigured === null
                            ? "Estado no disponible"
                            : aiConfigured
                              ? "Configurada · pendiente de prueba en vivo"
                              : "Sin configurar"
                          : "Sin conectar"}
                    </Badge>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "Activity history" && (
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
          {tab === "Notifications" && (
            <Panel title="Notification preferences">
              <div className="panel-body">
                <label className="toggle-row">
                  <div>
                    <strong>Workspace reminders</strong>
                    <p>
                      Preference saved for the future notification service.
                      Acceptance requests remain visible in the inbox.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={data.settings.notifications}
                    onChange={async (e) => {
                      if (
                        !(await update((s) => ({
                          ...s,
                          settings: {
                            ...s.settings,
                            notifications: e.target.checked,
                          },
                        })))
                      )
                        return;
                      toast("Notification preference saved.");
                    }}
                  />
                </label>
                <Placeholder
                  title="Owner acceptance review"
                  description="The owner reviews each client acceptance notification before the offer is marked accepted."
                />
              </div>
            </Panel>
          )}
          {tab === "AI preferences" && (
            <Panel title="AI controls">
              <div className="panel-body">
                <div className="role-row">
                  <ShieldCheck size={23} />
                  <div>
                    <strong>Owner confirms every outgoing message</strong>
                    <p>
                      No autonomous replies, price negotiations, or acceptance
                      decisions.
                    </p>
                  </div>
                  <Badge>Required</Badge>
                </div>
                <Placeholder
                  title="Model, usage limits, and permitted context"
                  description="These settings will be available when an AI service is connected."
                />
              </div>
            </Panel>
          )}
          {tab === "Proposal preferences" && (
            <Panel title="Commercial defaults">
              <div className="panel-body">
                <p>
                  Daily rental rates come from the equipment catalog and are
                  copied into each proposal revision. Discounts apply before
                  tax. All amounts currently use USD.
                </p>
                <div className="info-note">
                  This calculation convention is provisional. Confirm rental
                  periods, rounding, tax treatment, deposits, and validity with
                  the business before live use.
                </div>
                <Placeholder
                  title="Branded templates and commercial terms"
                  description="Company-wide template editing will follow the core proposal workflow."
                />
              </div>
            </Panel>
          )}
          {tab === "Event preferences" && (
            <Panel title="Event defaults">
              <div className="panel-body">
                <div className="detail-facts">
                  <div>
                    <span>Default time zone</span>
                    <strong>{data.settings.timezone}</strong>
                  </div>
                  <div>
                    <span>Design units</span>
                    <strong>Meters · initial workspace</strong>
                  </div>
                  <div>
                    <span>Starting status</span>
                    <strong>Planning</strong>
                  </div>
                </div>
                <Placeholder
                  title="Custom event types and transition rules"
                  description="Further configuration will follow validation of the production workflow."
                />
              </div>
            </Panel>
          )}
          {tab === "Workspace data" && mode === "company" && (
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
          {tab === "Workspace data" && mode === "sample" && (
            <Panel title="Your local workspace">
              <div className="panel-body">
                <p>
                  This preview saves changes in this browser on this device. It
                  does not provide shared cloud storage, authentication, or a
                  production backup service.
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
                  Export local backup
                </Button>
                <hr />
                <h3>Restore sample workspace</h3>
                <p>
                  Replace local edits with the original illustrative clients,
                  events, and proposals.
                </p>
                <Button variant="danger" onClick={() => setResetting(true)}>
                  Restore sample data
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
