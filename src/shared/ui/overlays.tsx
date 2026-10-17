import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";
import { uiLabel } from "../i18n";

export type Placement =
  | "bottom-start"
  | "bottom-end"
  | "top-start"
  | "top-end"
  | "right-start"
  | "right-end";

const GAP = 6;

function place(
  anchor: DOMRect,
  panel: { width: number; height: number },
  placement: Placement,
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let [side, align] = placement.split("-") as [string, string];
  // Flip when the preferred side does not fit.
  if (side === "bottom" && anchor.bottom + GAP + panel.height > vh)
    side = anchor.top - GAP - panel.height >= 0 ? "top" : side;
  else if (side === "top" && anchor.top - GAP - panel.height < 0)
    side = "bottom";
  else if (side === "right" && anchor.right + GAP + panel.width > vw)
    side = "bottom";
  let top = 0;
  let left = 0;
  if (side === "bottom" || side === "top") {
    top =
      side === "bottom" ? anchor.bottom + GAP : anchor.top - GAP - panel.height;
    left = align === "end" ? anchor.right - panel.width : anchor.left;
  } else {
    left = anchor.right + GAP;
    top = align === "end" ? anchor.bottom - panel.height : anchor.top;
  }
  left = Math.max(8, Math.min(left, vw - panel.width - 8));
  top = Math.max(8, Math.min(top, vh - panel.height - 8));
  return { top, left, side };
}

/**
 * A floating panel anchored to an element. It renders in the browser's top
 * layer when available, inside any open dialog that contains its anchor, so it
 * is never clipped or made inert by a modal.
 */
export function Popover({
  anchor,
  open,
  onClose,
  placement = "bottom-start",
  children,
  className = "",
  role,
  label,
  labelledBy,
  id,
  focusOnOpen = true,
  closeOnOutside = true,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  role?: string;
  label?: string;
  labelledBy?: string;
  id?: string;
  focusOnOpen?: boolean;
  closeOnOutside?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    side: string;
  } | null>(null);
  const reposition = useCallback(() => {
    const target = anchor.current;
    const panel = ref.current;
    if (!target || !panel) return;
    setPosition(
      place(
        target.getBoundingClientRect(),
        { width: panel.offsetWidth, height: panel.offsetHeight },
        placement,
      ),
    );
  }, [anchor, placement]);
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const panel = ref.current;
    if (panel && "showPopover" in panel) {
      try {
        panel.showPopover();
      } catch {
        /* Already shown or unsupported: fixed positioning still applies. */
      }
    }
    reposition();
  }, [open, reposition]);
  useEffect(() => {
    if (!open) return;
    const onScroll = () => reposition();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    const onPointer = (event: PointerEvent) => {
      if (!closeOnOutside) return;
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.current?.contains(target))
        return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Tooltips close quietly and let Escape reach dialogs and menus.
      if (role !== "tooltip") {
        event.stopPropagation();
        event.preventDefault();
        anchor.current?.focus();
      }
      onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, reposition, onClose, anchor, closeOnOutside, role]);
  useEffect(() => {
    if (!open || !focusOnOpen || !position) return;
    const panel = ref.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const first = panel.querySelector<HTMLElement>(
      '[data-autofocus], [role="menuitem"]:not([disabled]), [role="option"][aria-selected="true"], button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panel).focus({ preventScroll: true });
  }, [open, focusOnOpen, position]);
  if (!open) return null;
  const host =
    (anchor.current?.closest("dialog[open]") as HTMLElement | null) ??
    document.body;
  return createPortal(
    <div
      ref={ref}
      id={id}
      // Manual popovers render in the top layer without light-dismiss rules.
      {...({ popover: "manual" } as Record<string, string>)}
      role={role}
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className={`popover ${className}`}
      data-side={position?.side ?? placement.split("-")[0]}
      data-ready={position ? "true" : "false"}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
      }}
    >
      {children}
    </div>,
    host,
  );
}

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      onSelect?: () => void;
      to?: string;
      href?: string;
      danger?: boolean;
      disabled?: boolean;
      shortcut?: ReactNode;
      description?: string;
    }
  | "separator";

function focusItem(container: HTMLElement | null, index: number) {
  const items = Array.from(
    container?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    ) ?? [],
  );
  if (!items.length) return;
  const next = (index + items.length) % items.length;
  items[next].focus();
}

/** Accessible list of items for a Menu. Arrow keys, Home/End and typeahead. */
export function MenuList({
  items,
  onDone,
  label,
}: {
  items: MenuItem[];
  onDone: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(ref.current, index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(ref.current, index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(ref.current, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(ref.current, items.length - 1);
    } else if (event.key === "Tab") {
      onDone();
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const start = index + 1;
      const order = [...items.slice(start), ...items.slice(0, start)];
      order
        .find((item) =>
          item.textContent?.trim().toLowerCase().startsWith(letter),
        )
        ?.focus();
    }
  };
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="menu-list"
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => {
        if (item === "separator")
          return (
            <div
              key={`s${index}`}
              role="separator"
              className="menu-separator"
            />
          );
        const content = (
          <>
            {item.icon && (
              <span className="menu-icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="menu-label">
              {uiLabel(item.label)}
              {item.description && <small>{uiLabel(item.description)}</small>}
            </span>
            {item.shortcut && (
              <span className="menu-shortcut">{item.shortcut}</span>
            )}
          </>
        );
        const className = `menu-item ${item.danger ? "danger" : ""}`;
        if (item.to && !item.disabled)
          return (
            <Link
              key={item.label}
              role="menuitem"
              tabIndex={-1}
              className={className}
              to={item.to}
              onClick={() => {
                item.onSelect?.();
                onDone();
              }}
            >
              {content}
            </Link>
          );
        if (item.href && !item.disabled)
          return (
            <a
              key={item.label}
              role="menuitem"
              tabIndex={-1}
              className={className}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDone}
            >
              {content}
            </a>
          );
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={className}
            aria-disabled={item.disabled || undefined}
            onClick={() => {
              if (item.disabled) return;
              onDone();
              item.onSelect?.();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

/** A "⋯" (or custom) trigger that opens a menu of actions. */
export function Menu({
  label,
  items,
  trigger,
  placement = "bottom-end",
  className = "icon-button",
}: {
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  placement?: Placement;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  const openAt = (where: "first" | "last") => {
    setOpen(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const menu = document.getElementById(menuId);
        focusItem(menu, where === "first" ? 0 : -1);
      }),
    );
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={uiLabel(label)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openAt("first"))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openAt("first");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openAt("last");
          }
        }}
      >
        {trigger ?? <MoreHorizontal size={18} aria-hidden="true" />}
      </button>
      <Popover
        anchor={button}
        open={open}
        onClose={close}
        placement={placement}
        className="menu-popover"
        id={menuId}
      >
        <MenuList
          items={items}
          label={label}
          onDone={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      </Popover>
    </>
  );
}

/**
 * Shows a short label next to its child on hover and keyboard focus after a
 * delay. The child keeps its own accessible name; the tooltip describes it.
 */
export function Tooltip({
  label,
  children,
  placement = "top-start",
  delay = 300,
  disabled = false,
}: {
  label: ReactNode;
  children: ReactElement;
  placement?: Placement;
  delay?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const show = () => {
    if (disabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => hide(), []);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": open ? id : undefined,
      })
    : children;
  return (
    <span
      ref={anchor}
      className="tooltip-anchor"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
    >
      {child}
      <Popover
        anchor={anchor}
        open={open && !disabled}
        onClose={hide}
        placement={placement}
        className="tooltip"
        role="tooltip"
        id={id}
        focusOnOpen={false}
      >
        {label}
      </Popover>
    </span>
  );
}

export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id={titleId}>{uiLabel(title)}</h2>
          {description && <p>{uiLabel(description)}</p>}
        </div>
        <button
          className="icon-button"
          aria-label={uiLabel("Close dialog")}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

/**
 * A side sheet for review and detail work. It is a modal dialog, so focus
 * stays inside until it closes with Esc, the close button or the backdrop.
 */
export function Drawer({
  title,
  description,
  onClose,
  children,
  side = "right",
  footer,
  className = "",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  side?: "right" | "left";
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`drawer ${side} ${className}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-panel">
        <header className="drawer-heading">
          <div>
            <h2 id={titleId}>{uiLabel(title)}</h2>
            {description && <p>{uiLabel(description)}</p>}
          </div>
          <button
            className="icon-button"
            aria-label={uiLabel("Close dialog")}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-footer">{footer}</footer>}
      </div>
    </dialog>
  );
}
