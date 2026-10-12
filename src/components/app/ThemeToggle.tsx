"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const current = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    setTheme(current ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pm-theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button type="button" onClick={toggle} className="btn-ghost px-2" aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
