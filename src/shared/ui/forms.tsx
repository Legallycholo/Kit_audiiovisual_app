import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { uiLabel } from "../i18n";
import { Popover } from "./overlays";

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={16} aria-hidden="true" />
      <input
        aria-label={uiLabel(placeholder)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Moves focus among sibling controls with arrow keys, Home and End. */
function rovingKey(
  event: ReactKeyboardEvent<HTMLElement>,
  selector: string,
  vertical = false,
) {
  const keys = vertical
    ? ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]
    : ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return null;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(selector),
  ).filter((item) => !item.hasAttribute("disabled"));
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index < 0) return null;
  event.preventDefault();
  const back = ["ArrowLeft", "ArrowUp"].includes(event.key);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (back ? -1 : 1) + items.length) % items.length;
  items[next].focus();
  return items[next];
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="tabs"
      role="tablist"
      onKeyDown={(event) => {
        const next = rovingKey(event, '[role="tab"]');
        if (next?.dataset.value) onChange(next.dataset.value);
      }}
    >
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === item}
          tabIndex={value === item ? 0 : -1}
          className={value === item ? "active" : ""}
          data-value={item}
          key={item}
          onClick={() => onChange(item)}
        >
          {uiLabel(item)}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{uiLabel(label)}</span>
      {children}
      {hint && <small>{uiLabel(hint)}</small>}
    </label>
  );
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  description?: string;
}

/** Two to four mutually exclusive options. Arrow keys move and select. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel = true,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="segmented-field">
      <span
        id={labelId}
        className={hideLabel ? "visually-hidden" : "segmented-label"}
      >
        {uiLabel(label)}
      </span>
      <div
        className="segmented-control"
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={(event) => {
          const next = rovingKey(event, '[role="radio"]', true);
          if (next?.dataset.value) onChange(next.dataset.value as T);
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            data-value={option.value}
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <span aria-hidden="true">{option.icon}</span>}
            {uiLabel(option.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** An on/off setting that applies immediately. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className="switch-row">
      <div className={hideLabel ? "visually-hidden" : "switch-text"}>
        <strong id={labelId}>{uiLabel(label)}</strong>
        {description && <p id={descriptionId}>{uiLabel(description)}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        className="switch"
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A listbox for choices with more than five options or secondary settings.
 * Short choices use SegmentedControl instead.
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = "Selecciona…",
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const close = useCallback(() => setOpen(false), []);
  const show = (index?: number) => {
    const current = options.findIndex((option) => option.value === value);
    setActive(index ?? Math.max(0, current));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    button.current?.focus();
  };
  const onListKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(options.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const letter = event.key.toLowerCase();
      const found = options.findIndex(
        (option, index) =>
          index > active &&
          uiLabel(option.label).toLowerCase().startsWith(letter),
      );
      const wrap = options.findIndex((option) =>
        uiLabel(option.label).toLowerCase().startsWith(letter),
      );
      if (found >= 0 || wrap >= 0) setActive(found >= 0 ? found : wrap);
    }
  };
  return (
    <div className="select-field">
      <span
        id={labelId}
        className={hideLabel ? "visually-hidden" : "select-label"}
      >
        {uiLabel(label)}
      </span>
      <button
        ref={button}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${labelId}-value`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span id={`${labelId}-value`} className={selected ? "" : "muted"}>
          {selected ? uiLabel(selected.label) : ""}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <Popover
        anchor={button}
        open={open}
        onClose={close}
        className="select-popover"
      >
        <div
          id={listId}
          role="listbox"
          tabIndex={0}
          data-autofocus
          aria-labelledby={labelId}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className="select-list"
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`select-option ${index === active ? "active" : ""}`}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>
                {uiLabel(option.label)}
                {option.description && (
                  <small>{uiLabel(option.description)}</small>
                )}
              </span>
              {option.value === value && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
