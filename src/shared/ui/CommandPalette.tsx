import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { uiLabel } from "../i18n";
import { Kbd } from "./primitives";

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  shortcut?: ReactNode;
  run: () => void;
}

export interface PaletteGroup {
  id: string;
  title: string;
  items: PaletteItem[];
}

/**
 * ⌘K command palette. The parent filters the groups for the current query;
 * this component owns the dialog, keyboard model and combobox semantics.
 */
export function CommandPalette({
  open,
  onClose,
  query,
  onQuery,
  groups,
  onFullSearch,
  placeholder = "Busca acciones, páginas y registros…",
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  onQuery: (value: string) => void;
  groups: PaletteGroup[];
  onFullSearch: (query: string) => void;
  placeholder?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const titleId = useId();
  const [active, setActive] = useState(0);
  const visible = useMemo(
    () => groups.filter((group) => group.items.length > 0),
    [groups],
  );
  const flat = useMemo(
    () => visible.flatMap((group) => group.items),
    [visible],
  );
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    const option = list.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    option?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };
  let index = -1;
  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="palette-panel">
          <h2 id={titleId} className="visually-hidden">
            {uiLabel("Command palette")}
          </h2>
          <label className="palette-search">
            <Search size={18} aria-hidden="true" />
            <input
              ref={input}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                flat[active] ? `${listId}-${active}` : undefined
              }
              aria-label={uiLabel("Search actions, pages and records")}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((value) =>
                    flat.length ? (value + 1) % flat.length : 0,
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((value) =>
                    flat.length ? (value - 1 + flat.length) % flat.length : 0,
                  );
                } else if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey)
                ) {
                  event.preventDefault();
                  if (query.trim()) {
                    onClose();
                    onFullSearch(query.trim());
                  }
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  run(flat[active]);
                }
              }}
            />
            <Kbd>Esc</Kbd>
          </label>
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={uiLabel("Results")}
            className="palette-results"
          >
            {visible.map((group) => (
              <div
                key={group.id}
                role="group"
                aria-labelledby={`${listId}-${group.id}`}
                className="palette-group"
              >
                <div
                  id={`${listId}-${group.id}`}
                  role="presentation"
                  className="palette-group-title"
                >
                  {uiLabel(group.title)}
                </div>
                {group.items.map((item) => {
                  index += 1;
                  const position = index;
                  return (
                    <div
                      key={item.id}
                      id={`${listId}-${position}`}
                      data-index={position}
                      role="option"
                      aria-selected={position === active}
                      className={`palette-option ${position === active ? "active" : ""}`}
                      onPointerMove={() => setActive(position)}
                      onClick={() => run(item)}
                    >
                      {item.icon && (
                        <span className="palette-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      <span className="palette-text">
                        <span>{item.label}</span>
                        {item.hint && <small>{item.hint}</small>}
                      </span>
                      {item.shortcut && (
                        <span className="palette-shortcut">
                          {item.shortcut}
                        </span>
                      )}
                      {position === active && (
                        <CornerDownLeft
                          size={15}
                          className="palette-enter"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {flat.length === 0 && (
              <p className="palette-empty">
                {uiLabel("No matches. Press ⌘↵ to search the whole workspace.")}
              </p>
            )}
          </div>
          <footer className="palette-footer" aria-hidden="true">
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> {uiLabel("move")}
            </span>
            <span>
              <Kbd>↵</Kbd> {uiLabel("open")}
            </span>
            <span>
              <Kbd keys={["mod", "enter"]} /> {uiLabel("full search")}
            </span>
          </footer>
        </div>
      )}
    </dialog>
  );
}
