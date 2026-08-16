"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "vayliron-theme";

/**
 * Runs before the first paint so a pinned theme never flashes the wrong one.
 * Kept as a string because it has to be inlined into the document head.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private browsing with storage blocked: the choice just won't persist.
  }
}

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
  { value: "system", label: "Auto", icon: "◐" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  // The server cannot know the choice, so the control mounts neutral and
  // corrects itself once it can read the document.
  useEffect(() => {
    const stored = document.documentElement.getAttribute("data-theme");
    setTheme(stored === "light" || stored === "dark" ? stored : "system");
  }, []);

  return (
    <div
      className="flex items-center rounded-full border border-edge p-0.5"
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setTheme(option.value);
              apply(option.value);
            }}
            aria-pressed={active}
            title={`${option.label} theme`}
            className={`size-7 rounded-full text-xs transition-colors ${
              active
                ? "bg-brand text-on-brand"
                : "text-muted hover:bg-raised hover:text-body"
            }`}
          >
            <span aria-hidden="true">{option.icon}</span>
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
