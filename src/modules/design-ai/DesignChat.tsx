import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, Sparkles, WandSparkles } from "lucide-react";
import type { DesignChatMessage } from "../../shared/kit-design";

/** KIT Design's conversation panel. The parent decides what a message does. */
export function DesignChat({
  messages,
  greeting,
  placeholder,
  submitLabel,
  firstDesign,
  blockedReason,
  working,
  note,
  onRestart,
  onSubmit,
}: {
  messages: DesignChatMessage[];
  greeting: string;
  placeholder: string;
  submitLabel: string;
  firstDesign: boolean;
  /** Why the person cannot send right now; shown under the box. */
  blockedReason?: string;
  working: string;
  /** Small print under the button, e.g. the render allowance. */
  note?: string;
  /** Reiniciar: clears this design's versions and conversation. Absent when there is nothing to clear. */
  onRestart?: () => void;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length, working]);
  const send = async () => {
    if (!text.trim() || blockedReason || working) return;
    if (await onSubmit(text.trim())) setText("");
  };
  return (
    <aside className="kd-chat" aria-label="KIT Design">
      <header className="kd-chat-head">
        <Sparkles size={18} aria-hidden="true" />
        <strong>KIT Design</strong>
        {onRestart && (
          <button
            type="button"
            className="button ghost kd-restart"
            disabled={!!working}
            onClick={onRestart}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reiniciar
          </button>
        )}
      </header>
      <ol className="kd-chat-list" ref={list}>
        <li className="kd-msg kd-msg-assistant">{greeting}</li>
        {messages.map((message) => (
          <li key={message.id} className={`kd-msg kd-msg-${message.role}`}>
            {message.text}
          </li>
        ))}
        {working && (
          <li
            className="kd-msg kd-msg-assistant kd-msg-working"
            aria-live="polite"
          >
            {working}
          </li>
        )}
      </ol>
      <form
        className="kd-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          aria-label="Mensaje para KIT Design"
          rows={3}
          value={text}
          placeholder={placeholder}
          disabled={!!working}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {blockedReason && <small className="muted">{blockedReason}</small>}
        <button
          type="submit"
          className="button primary"
          disabled={!text.trim() || !!blockedReason || !!working}
        >
          {firstDesign ? <WandSparkles size={16} /> : <Send size={16} />}
          {submitLabel}
        </button>
        {note && <small className="muted kd-chat-note">{note}</small>}
      </form>
    </aside>
  );
}
