import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  files,
  nativeFiles,
  type FileStatus,
  type FilePolicy,
  type IndexedFile,
} from "../shared/file-search";
import { CloudSearchSettings } from "./CloudSearchSettings";
export function FileLibrary() {
  const [status, setStatus] = useState<FileStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exclusions, setExclusions] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = () =>
    files<FileStatus>("file_status")
      .then(setStatus)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    if (!nativeFiles()) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const read = () =>
      files<FileStatus>("file_status")
        .then((s) => {
          if (active) {
            setStatus(s);
            timer = setTimeout(read, 3000);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    void read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [attempt]);
  useEffect(() => {
    if (status) setExclusions(status.policy.exclusions.join("\n"));
  }, [status?.policy.exclusions.join("\n")]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function policy(update: Partial<FilePolicy>) {
    if (!status) return;
    if (update.granted === false) setConfirm(false);
    void run(() =>
      files("file_policy", {
        policy: { ...status.policy, ...update },
        confirmed: confirm,
      }),
    );
  }
  return (
    <section className="file-library">
      <h1>Archivos del equipo</h1>
      <p>
        Acceso personal, de solo lectura. KIT no modifica ni elimina tus
        archivos originales.
      </p>
      {!nativeFiles() ? (
        <p role="status">
          Abre la ventana local de KIT Desktop para autorizar carpetas. La
          ventana de empresa y el navegador no tienen acceso nativo.
        </p>
      ) : (
        <>
          {status && (
            <>
              <div className="panel">
                <h2>Permiso y alcance</h2>
                <p>
                  Carpeta personal: <code>{status.home}</code>
                </p>
                <p>
                  Al autorizar, KIT leerá archivos compatibles dentro de esta
                  carpeta, excepto las exclusiones. El contenido y los nombres
                  se guardan en un índice local cifrado. No se suben a la nube
                  con este permiso.
                </p>
                <p>
                  PDF, DOCX, PPTX, XLSX, TXT, Markdown, CSV y nombres de
                  imágenes PNG/JPEG/WebP. Máximo 20 MB por archivo; no se siguen
                  enlaces simbólicos. Las carpetas protegidas por el sistema
                  pueden requerir permiso adicional.
                </p>
                <label>
                  Excluir rutas relativas o patrones, uno por línea
                  <textarea
                    rows={4}
                    value={exclusions}
                    onChange={(e) => setExclusions(e.target.value)}
                    placeholder="Documents/Privado/**"
                  />
                </label>
                <details>
                  <summary>Exclusiones de seguridad permanentes</summary>
                  <p>{status.exclusions.join(", ")}</p>
                </details>
                {!status.policy.granted && (
                  <label>
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />{" "}
                    Autorizo la lectura e indexación de mi carpeta personal con
                    estas exclusiones.
                  </label>
                )}
                <div className="file-actions">
                  <button
                    className="button primary"
                    disabled={busy || (!status.policy.granted && !confirm)}
                    onClick={() =>
                      policy({
                        granted: true,
                        exclusions: exclusions
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  >
                    {status.policy.granted
                      ? "Guardar exclusiones"
                      : "Autorizar e indexar"}
                  </button>
                  {status.policy.granted && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "¿Revocar acceso y borrar el índice local? Los archivos originales no cambian.",
                          )
                        )
                          policy({ granted: false, cloudConsent: false });
                      }}
                    >
                      Revocar acceso
                    </button>
                  )}
                </div>
              </div>
              <div className="panel" aria-live="polite">
                <h2>Estado del índice</h2>
                {status.pendingDeletions > 0 && (
                  <p role="status">
                    {status.pendingDeletions} copias de nube pendientes de
                    borrado. Se reintentan mientras KIT y el servicio estén
                    disponibles.
                  </p>
                )}
                <p>
                  {!status.policy.granted
                    ? "Sin autorización"
                    : status.policy.paused
                      ? "En pausa"
                      : status.running
                        ? "Indexando…"
                        : "Listo para buscar"}{" "}
                  · {status.indexed} indexados · {status.scanned} revisados ·{" "}
                  {status.skipped} omitidos · {status.failed} errores
                </p>
                <p>
                  Cobertura: archivos compatibles y accesibles, hasta 100.000
                  por recorrido. Las imágenes sin OCR se encuentran por nombre y
                  ruta, no por su contenido visual.
                </p>
                <p>
                  OCR:{" "}
                  {status.ocrAvailable
                    ? "motor configurado; requiere modelos de inglés y español"
                    : "no instalado; texto de imágenes y PDF escaneados no incluido"}
                  .
                </p>
                <label>
                  <input
                    type="checkbox"
                    disabled={
                      busy || !status.ocrAvailable || !status.policy.granted
                    }
                    checked={status.policy.ocr}
                    onChange={(e) => policy({ ocr: e.target.checked })}
                  />{" "}
                  OCR local de imágenes (reconstruye el índice; PDF escaneados
                  no incluidos)
                </label>
                <div className="file-actions">
                  <button
                    className="button"
                    disabled={busy || !status.policy.granted}
                    onClick={() => policy({ paused: !status.policy.paused })}
                  >
                    {status.policy.paused ? "Continuar" : "Pausar"}
                  </button>
                  <button
                    className="button"
                    disabled={
                      busy ||
                      !status.policy.granted ||
                      status.policy.paused ||
                      status.running
                    }
                    onClick={() =>
                      void run(() => files("file_scan", { rebuild: false }))
                    }
                  >
                    Escanear / reintentar
                  </button>
                  <button
                    className="button"
                    disabled={busy || !status.policy.granted || status.running}
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Reconstruir el índice? La búsqueda estará incompleta mientras se procesa.",
                        )
                      )
                        void run(() => files("file_scan", { rebuild: true }));
                    }}
                  >
                    Reconstruir
                  </button>
                  <Link className="button" to="/search">
                    Buscar archivos
                  </Link>
                </div>
                {status.errors.length > 0 && (
                  <details>
                    <summary>Detalles de errores ({status.failed})</summary>
                    <ul>
                      {status.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <>
          <p role="alert">{error}</p>
          {nativeFiles() && (
            <button
              className="button"
              onClick={() => {
                setError("");
                setAttempt((a) => a + 1);
              }}
            >
              Reintentar acceso al índice
            </button>
          )}
        </>
      )}
      <CloudSearchSettings />
    </section>
  );
}
export function FilePreview() {
  const { id = "" } = useParams();
  const [file, setFile] = useState<IndexedFile>();
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (file)
      window.dispatchEvent(
        new CustomEvent("kit:resource-title", {
          detail: { route: `/files/${id}`, title: file.title },
        }),
      );
  }, [file, id]);
  useEffect(() => {
    let active = true;
    setFile(undefined);
    setImage("");
    setError("");
    files<IndexedFile>("file_preview", { id })
      .then(async (f) => {
        const image = f.mime.startsWith("image/")
          ? await files<string>("file_image", { id })
          : "";
        if (active) {
          setFile(f);
          setImage(image);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <section>
      <h1>{file?.title || "Vista previa del archivo"}</h1>
      <Link to="/library/files">Permisos y estado del índice</Link>
      {error ? (
        <p role="alert">{error}</p>
      ) : !file ? (
        <p role="status">Cargando…</p>
      ) : (
        <>
          <p>
            {file.relativePath} · {file.mime} · {Math.ceil(file.bytes / 1024)}{" "}
            KB
          </p>
          <button
            className="button"
            onClick={() => {
              if (
                window.confirm(
                  "Se abrirá el archivo en otra aplicación con sus propios permisos. ¿Continuar?",
                )
              )
                void files("file_open", { id, confirmed: true }).catch((e) =>
                  setError(String(e)),
                );
            }}
          >
            Abrir en aplicación predeterminada
          </button>
          {file.cloudHash === file.hash ? (
            <button
              className="button primary"
              onClick={() =>
                void files("open_company_window", {
                  route: `/kit?source=${encodeURIComponent(file.id)}&sourceTitle=${encodeURIComponent(file.title)}`,
                }).catch((e) => setError(String(e)))
              }
            >
              Preguntar a KIT sobre este archivo
            </button>
          ) : (
            <p className="muted">
              Para usar este archivo con KIT, conecta el dispositivo, aprueba la
              política de nube y sincroniza la versión actual.
            </p>
          )}
          {image ? (
            <img className="file-preview-image" src={image} alt={file.title} />
          ) : (
            <pre className="file-preview-text">
              {file.text ||
                "No hay texto extraíble. Puede ser un documento escaneado."}
            </pre>
          )}
          <p className="muted">
            Vista segura de texto, limitada a 100.000 caracteres. No se ejecutan
            scripts ni macros.
          </p>
        </>
      )}
    </section>
  );
}
