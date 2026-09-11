"use client";

import { Activity, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { scannerApi, type Health } from "@/lib/api";

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("hatch-theme");
    const next = stored ? stored === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }, []);

  useEffect(() => {
    const refresh = () => scannerApi.health().then(setHealth).catch(() => setHealth(null));
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("hatch-theme", next ? "dark" : "light");
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to scanner content</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/" aria-label="Hatch overview">
            <span className="brand-mark" aria-hidden="true">🐢</span>
            <span><strong>Hatch</strong><small>TortoiseOS operator</small></span>
          </Link>
          <nav className="nav" aria-label="Main navigation">
            <Link href="/">Overview</Link>
            <Link href="/scanner">Scanner</Link>
          </nav>
          <div className="status-cluster">
            <span className="network-pill"><Activity size={14} /> Sui Mainnet</span>
            <span className={health ? "health-pill online" : "health-pill offline"}>
              <span className="status-dot" /> {health ? "API online" : "API offline"}
            </span>
            <span className="readonly-pill"><ShieldCheck size={14} /> Read only</span>
            <button className="icon-button" onClick={toggleTheme} aria-label={`Use ${dark ? "light" : "dark"} theme`}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="page">{children}</main>
      <footer>Hatch observes quote surfaces. Signals are not executable guarantees.</footer>
    </div>
  );
}
