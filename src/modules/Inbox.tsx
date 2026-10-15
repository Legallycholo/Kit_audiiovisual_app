import { useState } from "react";
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
import { acceptConversation, id, money, quoteTotals } from "../shared/domain";
export function Inbox() {
  const { data, update, toast } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All conversations");
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState(false);
  const [sendPreview, setSendPreview] = useState(false);
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
      (filter !== "Needs review" || c.review === "Pending") &&
      data.clients
        .find((client) => client.id === c.clientId)
        ?.name.toLowerCase()
        .includes(query.toLowerCase()),
  );
  function changeReview(state: "Clarification needed" | "Not accepted") {
    if (!conversation) return;
    update((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id === conversation.id ? { ...c, review: state } : c,
      ),
      activity: [
        activity("Owner reviewed client response", state, conversation.eventId),
        ...s.activity,
      ],
    }));
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
        eyebrow="KEEP THE CONVERSATION CONNECTED"
        title="Client Inbox"
        description="Every client exchange, with the right event and proposal alongside it."
        actions={<Badge tone="neutral">WhatsApp not connected</Badge>}
      />
      <div className="inbox-workspace">
        <aside className="conversation-list">
          <div className="conversation-list-header">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Search conversations…"
            />
            <select
              aria-label="Filter conversations"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option>All conversations</option>
              <option>Needs review</option>
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
                    Sample WhatsApp {c.review === "Pending" && <i />}
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
                <Badge tone="neutral">Sample thread</Badge>
              </header>
              <div className="messages">
                <div className="message-date">
                  Illustrative conversation · no live messages
                </div>
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
                          Proposal · revision {m.proposalVersion}
                          <small>View the exact offer</small>
                        </span>
                        <ArrowUpRight size={14} />
                      </Link>
                    )}
                    <small>
                      {new Date(m.at).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {m.direction === "out" && <CheckCheck size={13} />}
                      {m.status === "Draft" && " · Local draft"}
                    </small>
                  </div>
                ))}
              </div>
              <form
                className="message-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSendPreview(true);
                }}
              >
                <textarea
                  aria-label="Reply to client"
                  placeholder="Write a reply for owner review…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div>
                  <span>
                    <ShieldCheck size={14} />
                    Owner confirmation required
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!draft.trim()}
                    onClick={() => {
                      const message = {
                        id: id(),
                        direction: "out" as const,
                        text: draft,
                        at: new Date().toISOString(),
                        status: "Draft" as const,
                      };
                      update((s) => ({
                        ...s,
                        conversations: s.conversations.map((c) =>
                          c.id === conversation.id
                            ? { ...c, messages: [...c.messages, message] }
                            : c,
                        ),
                      }));
                      setDraft("");
                      toast(
                        "Reply saved locally as a draft. Nothing was sent.",
                      );
                    }}
                  >
                    Save draft
                  </Button>
                  <Button disabled={!draft.trim()}>
                    <Send size={15} />
                    Review
                  </Button>
                </div>
              </form>
            </section>
            <aside className="conversation-context">
              <span className="eyebrow">CONNECTED TO THIS CONVERSATION</span>
              <Link className="context-event" to={`/events/${event?.id}`}>
                <strong>{event?.name}</strong>
                <ArrowUpRight size={16} />
              </Link>
              {proposal && (
                <div className="context-proposal">
                  <FileText size={23} />
                  <h3>{proposal.number}</h3>
                  <p>Revision {conversation.proposalVersion}</p>
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
                    Open exact revision
                    <ArrowUpRight size={13} />
                  </Link>
                </div>
              )}
              {conversation.review === "Pending" ? (
                <div className="acceptance-review">
                  <span className="review-symbol">
                    <ShieldCheck size={23} />
                  </span>
                  <h3>A response needs your review</h3>
                  <p>
                    The client appears ready to proceed. Review their message
                    and the exact offer before confirming acceptance.
                  </p>
                  <Badge>Awaiting owner review</Badge>
                  <Button onClick={() => setReview(true)}>
                    <Check size={15} />
                    Review acceptance
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => changeReview("Clarification needed")}
                  >
                    Request clarification
                  </Button>
                  <button
                    className="text-button"
                    onClick={() => changeReview("Not accepted")}
                  >
                    Do not accept
                  </button>
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
                      ? "Owner decision recorded. Resource availability and production readiness are separate checks."
                      : "The conversation remains available for follow-up."}
                  </p>
                </div>
              )}
              <div className="context-footnote">
                <ShieldCheck size={16} />
                No automatic sending or acceptance.
              </div>
            </aside>
          </>
        ) : (
          <Empty
            title="Your client conversations belong here"
            description="Connect WhatsApp to receive client messages in this workspace."
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
                conversation.messages.filter((m) => m.direction === "in").at(-1)
                  ?.text
              }
              ”
              <small>
                {client?.contact} · {client?.name}
              </small>
            </div>
            <div className="simple-row">
              <strong>
                {proposal.number} · revision {conversation.proposalVersion}
              </strong>
              <span>
                {money(
                  quoteTotals(proposal.lines, proposal.discount, proposal.tax)
                    .total,
                )}
              </span>
            </div>
            <p>
              Confirm that this is the correct customer, offer, and revision.
              Stock, payment, and scheduling still need to be verified before
              production.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setReview(false)}>
                Keep pending
              </Button>
              <Button
                onClick={() => {
                  try {
                    const next = acceptConversation(data, conversation.id);
                    update(() => next);
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
      {sendPreview && (
        <Modal
          title="Review outgoing message"
          description={`${client?.contact} · ${client?.phone}`}
          onClose={() => setSendPreview(false)}
        >
          <div className="modal-body">
            <div className="review-quote">{draft}</div>
            <div className="connection-note">
              <MessageCircle size={22} />
              <div>
                <strong>WhatsApp connection required</strong>
                <p>
                  This message cannot leave the app until the company channel is
                  connected. You can save it as a local draft.
                </p>
              </div>
            </div>
            <Button disabled>Confirm & send · not connected</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
