import { Monitor, Moon, Sun } from "lucide-react";
import { useAppearance } from "../../shared/appearance";
import { uiLabel } from "../../shared/i18n";
import { Panel, SegmentedControl } from "../../shared/ui";

const swatch = (color: string) => (
  <span className="accent-swatch" style={{ background: color }} />
);

/** Per-person display preferences, saved on this device for this account. */
export function AppearanceSettings() {
  const { appearance, setAppearance } = useAppearance();
  return (
    <Panel
      title="Appearance"
      subtitle="Saved on this device for your account. Changes apply right away."
    >
      <div className="panel-body appearance-settings">
        <div className="setting-row">
          <div>
            <strong>{uiLabel("Theme")}</strong>
            <p>{uiLabel("System follows your device setting.")}</p>
          </div>
          <SegmentedControl
            label="Theme"
            value={appearance.theme}
            onChange={(theme) => setAppearance({ theme })}
            options={[
              { value: "light", label: "Claro", icon: <Sun size={15} /> },
              { value: "dark", label: "Oscuro", icon: <Moon size={15} /> },
              {
                value: "system",
                label: "Sistema",
                icon: <Monitor size={15} />,
              },
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>{uiLabel("Accent color")}</strong>
            <p>
              {uiLabel("Buttons, links and the active page use this color.")}
            </p>
          </div>
          <SegmentedControl
            label="Accent color"
            value={appearance.accent}
            onChange={(accent) => setAppearance({ accent })}
            options={[
              {
                value: "blue",
                label: "Azul",
                icon: swatch("var(--brand-blue)"),
              },
              { value: "red", label: "Rojo", icon: swatch("var(--brand-red)") },
              {
                value: "green",
                label: "Verde",
                icon: swatch("var(--brand-green)"),
              },
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>{uiLabel("Animations")}</strong>
            <p>
              {uiLabel(
                "System uses reduced animations when your device asks for less motion.",
              )}
            </p>
          </div>
          <SegmentedControl
            label="Animations"
            value={appearance.motion}
            onChange={(motion) => setAppearance({ motion })}
            options={[
              { value: "system", label: "Sistema" },
              { value: "full", label: "Completas" },
              { value: "reduced", label: "Reducidas" },
              { value: "off", label: "Desactivadas" },
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>{uiLabel("Density")}</strong>
            <p>{uiLabel("Compact fits more rows on screen.")}</p>
          </div>
          <SegmentedControl
            label="Density"
            value={appearance.density}
            onChange={(density) => setAppearance({ density })}
            options={[
              { value: "comfortable", label: "Cómoda" },
              { value: "compact", label: "Compacta" },
            ]}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>{uiLabel("Sidebar")}</strong>
            <p>{uiLabel("Also toggles with ⌘\\ or Ctrl+\\.")}</p>
          </div>
          <SegmentedControl
            label="Sidebar"
            value={appearance.sidebar}
            onChange={(sidebar) => setAppearance({ sidebar })}
            options={[
              { value: "expanded", label: "Expandida" },
              { value: "collapsed", label: "Contraída" },
            ]}
          />
        </div>
      </div>
    </Panel>
  );
}
