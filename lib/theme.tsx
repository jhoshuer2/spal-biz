"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "auto";
const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({ mode: "auto", setMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");

  useEffect(() => {
    const cur = document.documentElement.dataset.theme;
    if (cur === "light" || cur === "dark" || cur === "auto") setModeState(cur);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    document.documentElement.dataset.theme = m;
    try {
      localStorage.setItem("spal-theme", m);
    } catch {}
    // TODO(profile): also save to the shop row once accounts exist.
  }, []);

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
