import { Children, type ReactNode } from "react";
import { uiLabel } from "../i18n";

/** Translates plain string children through the interface dictionary. */
export function localize(children: ReactNode) {
  return Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    const label = child.trim();
    return label ? child.replace(label, uiLabel(label)) : child;
  });
}

/** True on Apple platforms, where shortcuts use ⌘ instead of Ctrl. */
export function isApplePlatform() {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}
