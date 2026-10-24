import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  FileText,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorNote,
  Modal,
  PageHeader,
  SearchField,
} from "../shared/ui";
import { ConnectNotice } from "./ConnectNotice";
import { id, money, quoteTotals } from "../shared/domain";
import type { Message } from "../shared/types";
import { uiLabel } from "../shared/i18n";
export function Inbox() {
  const {
    data,
    update,
    toast,
    user,
    mode,
    request,
    confirmAcceptance,
    confirmMessageSend,
  } = useWorkspace();
  const ownerReview = !user || user.isOwner;
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All conversations");
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState(false);
  const [sendPreview, setSendPreview] = useState<Message | null>(null);
  const [channel, setChannel] = useState<{
    configured: boolean;
    label: string | null;
  }>({
    configured: mode === "sample",
    label: mode === "sample" ? "Canal de demostración local" : null,
  });
  const [error, setError] = useState("");
  const conversation =
    data.conversations.find((c) => c.id === params.get("conversation")) ||
    data.conversations[0];
  const client = data.clients.find((c) => c.id === conversation?.clientId);
  const event = data.events.find((e) => e.id === conversation?.eventId);
  const proposal = data.proposals.find(
    (p) => p.id === conversation?.proposalId,
  );
  const conversations = data.conversations.filter(
    (c) =>
      (filter !== "Needs review" ||
        ["Pending", "Needs linking"].includes(c.review)) &&
      (filter !== "Send review" ||
        c.messages.some(
          (message) =>
            message.direction === "out" &&
            ["Draft", "Failed"].includes(message.status),
        )) &&
      data.clients
        .find((client) => client.id === c.clientId)
        ?.name.toLowerCase()
        .includes(query.toLowerCase()),
  );
  useEffect(() => {
    let active = true;
    if (mode === "sample") {
      setChannel({ configured: true, label: "Canal de demostración local" });
      return;
    }
    request<{ configured: boolean; label: string | null }>("/messaging/status")
      .then((result) => {
        if (active) setChannel(result);
      })
      .catch((caught) => {
        if (active) setError((caught as Error).message);
      });
    return () => {
      active = false;
    };
  }, [mode, request]);
  function outgoingDraft(text: string): Message {
    return {
      id: id(),
      direction: "out",
      text: text.trim(),
      at: new Date().toISOString(),
      status: "Draft",
      ...(conversation?.proposalId
        ? {
            proposalId: conversation.proposalId,
            proposalVersion: conversation.proposalVersion,
          }
        : {}),
    };
  }
  async function saveDraft(message: Message) {
    if (!conversation) return false;
    return update((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id === conversation.id
          ? { ...c, messages: [...c.messages, message] }
          : c,
      ),
    }));
  }
  async function changeReview(state: "Clarification needed" | "Not accepted") {
    if (!conversation) return;
    if (
      !(await update((s) => ({
        ...s,
        conversations: s.conversations.map((c) =>
          c.id === conversation.id ? { ...c, review: state } : c,
        ),
        activity: [
          activity(
            "Owner reviewed client response",
            state,
            conversation.eventId,
          ),
          ...s.activity,
        ],
      })))
    )
      return;
    if (state === "Clarification needed")
      setDraft(
        `Hi ${client?.contact.split(" ")[0]}, could you confirm that you would like to proceed with ${proposal?.number}, revision ${proposal?.version}?`,
      );
    toast(
      state === "Clarification needed"
        ? "Clarification drafted. Review it before sending."
        : "Response marked as not accepted. No message was sent.",
    );
  }
  return (
    <>
      <PageHeader
        title="Client Inbox"
        description="Every client exchange, with the right event and proposal alongside it."
        actions={
          channel.configured ? (
            <Badge tone={mode === "sample" ? "amber" : "green"}>
              {channel.label || "Canal configurado"}
            </Badge>
          ) : undefined
        }
      />
      {mode === "company" && !channel.configured && !error && (
        <ConnectNotice service="whatsapp" />
      )}
      <div className="inbox-workspace">
        <aside className="conversation-list">
          <div className="conversation-list-header">
            <SearchField value={query} onChange={setQuery} />
            <select
              aria-label="Filtrar conversaciones"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="All conversations">
                Todas las conversaciones
              </option>
              <option value="Needs review">Aceptaciones pendientes</option>
              <option value="Send review">Mensajes por revisar</option>
            </select>
          </div>
          {conversations.map((c) => {
            const contact = data.clients.find((cl) => cl.id === c.clientId);
            return (
              <button
                key={c.id}
                className={`conversation-item ${c.id === conversation?.id ? "active" : ""}`}
                onClick={() => {
                  setParams({ conversation: c.id });
                  setDraft("");
                  setError("");
                }}
              >
                <Avatar
                  label={contact?.initials || "CL"}
                  color={contact?.color}
                />
                <span>
                  <strong>{contact?.name}</strong>
                  <small>{c.messages.at(-1)?.text}</small>
                  <span className="conversation-meta">
                    <MessageCircle size={12} />
                    WhatsApp de muestra{" "}
                    {["Pending", "Needs linking"].includes(c.review) && <i />}
                  </span>
                </span>
              </button>
            );
          })}
          {conversations.length === 0 && (
            <Empty
              title="All clear"
              description="No conversations match this view."
            />
          )}
        </aside>
        {conversation ? (
          <>
            <section className="message-thread">
              <header>
                <Avatar
                  label={client?.initials || "CL"}
                  color={client?.color}
                />
                <div>
                  <strong>{client?.contact}</strong>
                  <small>
                    {client?.name} · {client?.phone}
                  </small>
                </div>
                {mode === "sample" && (
                  <Badge tone="neutral">Conversación de muestra</Badge>
                )}
              </header>
              <div className="messages">
                {mode === "sample" && (
                  <div className="message-date">
                    Conversación de ejemplo · sin mensajes reales
                  </div>
                )}
                {conversation.messages.map((m) => (
                  <div key={m.id} className={`message ${m.direction}`}>
                    <p>{m.text}</p>
                    {m.proposalId && (
                      <Link
                        className="message-attachment"
                        to={`/proposals/${m.proposalId}`}
                      >
                        <FileText size={19} />
                        <span>
                          {uiLabel("Proposal · revision")} {m.proposalVersion}
                          <small>{uiLabel("View the exact offer")}</small>
                        </span>
                        <ArrowUpRight size={14} />
                      </Link>
                    )}
                    <small>
                      {new Date(m.at).toLocaleTimeString("es-PR", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {m.direction === "out" && <CheckCheck size={13} />}
                      {` · ${messageStatus(m)}`}
                    </small>
                    {m.direction === "out" && m.status === "Draft" && (
                      <Button
                        variant="secondary"
                        disabled={!ownerReview}
                        onClick={() => setSendPreview(m)}
                      >
                        Revisar envío
                      </Button>
                    )}
                    {m.status === "Failed" && m.failureReason && (
                      <p className="message-failure">{m.failureReason}</p>
                    )}
                  </div>
                ))}
              </div>
              <form
                className="message-composer"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const message = outgoingDraft(draft);
                  if (!(await saveDraft(message))) return;
                  setDraft("");
                  setSendPreview(message);
                }}
              >
                <textarea
                  aria-label="Responder al cliente"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div>
                  <span>
                    <ShieldCheck size={14} />
                    {uiLabel("Owner confirmation required")}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!draft.trim()}
                    onClick={async () => {
                      if (!(await saveDraft(outgoingDraft(draft)))) return;
                      setDraft("");
                      toast("Borrador guardado. No se envió ningún mensaje.");
                    }}
                  >
                    Guardar borrador
                  </Button>
                  <Button disabled={!draft.trim()}>
                    <Send size={15} />
                    Revisar
                  </Button>
                </div>
              </form>
            </section>
            <aside className="conversation-context">
              <span className="eyebrow">
                {uiLabel("CONNECTED TO THIS CONVERSATION")}
              </span>
              <Link className="context-event" to={`/events/${event?.id}`}>
                <strong>{event?.name}</strong>
                <ArrowUpRight size={16} />
              </Link>
              {proposal && (
                <div className="context-proposal">
                  <FileText size={23} />
                  <h3>{proposal.number}</h3>
                  <p>Versión {conversation.proposalVersion}</p>
                  <strong className="context-amount">
                    {money(
                      quoteTotals(
                        proposal.lines,
                        proposal.discount,
                        proposal.tax,
                      ).total,
                    )}
                  </strong>
                  <Badge>{proposal.status}</Badge>
                  <Link to={`/proposals/${proposal.id}`}>
                    Abrir versión exacta
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
              {conversation.review === "Pending" ? (
                <div className="acceptance-review">
                  <span className="review-symbol">
                    <ShieldCheck size={23} />
                  </span>
                  <h3>Una respuesta requiere tu revisión</h3>
                  <p>
                    El cliente parece listo para continuar. Revisa su mensaje y
                    la oferta exacta antes de confirmar la aceptación.
                  </p>
                  <Badge>Awaiting owner review</Badge>
                  <Button
                    variant="secondary"
                    disabled={!ownerReview}
                    onClick={() => setReview(true)}
                  >
                    <Check size={15} />
                    Revisar aceptación
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!ownerReview}
                    onClick={() => changeReview("Clarification needed")}
                  >
                    Solicitar aclaración
                  </Button>
                  <button
                    className="text-button"
                    disabled={!ownerReview}
                    onClick={() => changeReview("Not accepted")}
                  >
                    No aceptar
                  </button>
                </div>
              ) : conversation.review === "Needs linking" ? (
                <div className="acceptance-review">
                  <span className="review-symbol">
                    <ShieldCheck size={23} />
                  </span>
                  <h3>Esta respuesta necesita vinculación</h3>
                  <p>
                    El mensaje parece indicar aceptación, pero no identifica la
                    oferta y versión exactas. No puede confirmarse hasta aclarar
                    ese vínculo.
                  </p>
                  <Badge>Requiere vinculación</Badge>
                  <Button
                    variant="secondary"
                    disabled={!ownerReview}
                    onClick={() => changeReview("Clarification needed")}
                  >
                    Solicitar aclaración
                  </Button>
                </div>
              ) : (
                <div className="review-result">
                  <Badge>
                    {conversation.review === "None"
                      ? "No acceptance request"
                      : conversation.review}
                  </Badge>
                  <p>
                    {conversation.review === "Confirmed"
                      ? "Decisión del propietario registrada. La disponibilidad de recursos y la preparación de producción se verifican por separado."
                      : "La conversación permanece disponible para seguimiento."}
                  </p>
                  {conversation.acceptanceEvidence && (
                    <p className="tiny muted">
                      Evidencia: mensaje{" "}
                      {conversation.acceptanceEvidence.messageId}
                      {" · "}versión{" "}
                      {conversation.acceptanceEvidence.proposalVersion}
                    </p>
                  )}
                </div>
              )}
              <div className="context-footnote">
                <ShieldCheck size={16} />
                No hay envíos ni aceptaciones automáticas.
              </div>
            </aside>
          </>
        ) : (
          <Empty
            icon={<MessageCircle size={26} />}
            title="No client conversations yet"
            description="Client messages appear here with their event and proposal once WhatsApp is connected."
          />
        )}
      </div>
      {review && proposal && (
        <Modal
          title="Confirm client acceptance"
          description="This records your review of the client's response. It does not send a reply or reserve equipment."
          onClose={() => setReview(false)}
        >
          <div className="modal-body">
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="review-quote">
              “
              {
                (conversation.reviewMessageId
                  ? conversation.messages.find(
                      (message) => message.id === conversation.reviewMessageId,
                    )
                  : conversation.messages
                      .filter((message) => message.direction === "in")
                      .at(-1)
                )?.text
              }
              ”
              <small>
                {client?.contact} · {client?.name}
              </small>
            </div>
            {conversation.reviewMessageId && (
              <p className="tiny muted">
                Evidencia del mensaje: {conversation.reviewMessageId}
              </p>
            )}
            <div className="simple-row">
              <strong>
                {proposal.number} · versión {conversation.proposalVersion}
              </strong>
              <span>
                {money(
                  quoteTotals(proposal.lines, proposal.discount, proposal.tax)
                    .total,
                )}
              </span>
            </div>
            <p>
              Confirma que este sea el cliente, la oferta y la versión
              correctos. El inventario, el pago y el calendario aún deben
              verificarse antes de producción.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setReview(false)}>
                Keep pending
              </Button>
              <Button
                onClick={async () => {
                  try {
                    if (!(await confirmAcceptance(conversation.id))) return;
                    setReview(false);
                    toast(
                      "Acceptance confirmed by the owner. No message was sent.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Confirm acceptance
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {sendPreview && conversation && (
        <Modal
          title="Revisar mensaje saliente"
          description={`${client?.contact} · ${client?.phone}`}
          onClose={() => setSendPreview(null)}
        >
          <div className="modal-body">
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="review-quote">{sendPreview.text}</div>
            {sendPreview.proposalId && (
              <div className="simple-row">
                <span>Oferta vinculada</span>
                <strong>
                  {proposal?.number} · versión {sendPreview.proposalVersion}
                </strong>
              </div>
            )}
            <div className="connection-note">
              <MessageCircle size={22} />
              <div>
                <strong>
                  {channel.configured
                    ? channel.label
                    : "Se requiere conectar un canal"}
                </strong>
                <p>
                  {mode === "sample"
                    ? "La demostración registra el flujo sin contactar al cliente."
                    : channel.configured
                      ? "Al confirmar, el mensaje pasa al canal configurado con este contenido exacto."
                      : "El borrador permanecerá en la aplicación hasta conectar el canal aprobado."}
                </p>
              </div>
            </div>
            <Button
              disabled={!ownerReview || !channel.configured}
              onClick={async () => {
                setError("");
                if (await confirmMessageSend(conversation.id, sendPreview.id))
                  setSendPreview(null);
              }}
            >
              {mode === "sample"
                ? "Confirmar envío de demostración"
                : channel.configured
                  ? "Confirmar y enviar"
                  : "Confirmar y enviar · sin conexión"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function messageStatus(message: Message) {
  const labels: Record<Message["status"], string> = {
    Received: "Recibido",
    "Sample sent": "Enviado de muestra",
    Draft: "Borrador",
    Queued: "En cola",
    Sent: "Enviado",
    Delivered: "Entregado",
    Failed: "Fallido",
  };
  return labels[message.status];
}
