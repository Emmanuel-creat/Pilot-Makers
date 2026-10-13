/**
 * Jeu d'icônes dessinées pour Pilot-Makers (trait de 1,75 px, grille 24 x 24).
 */

const PATHS: Record<string, string> = {
  home: "M4 11.5 12 5l8 6.5M6 10v9h4.5v-5h3v5H18v-9",
  quote: "M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19M9.5 12h7M9.5 15.5h7M9.5 9h3",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5M16 4.5a3.3 3.3 0 0 1 0 6.4M18 14.8c1.7.8 2.7 2.6 3 5.2",
  keyboard: "M3 6.5h18v11H3zM6.5 10h1M10 10h1M13.5 10h1M17 10h.5M6.5 13.5h1M9.5 14h5M17 13.5h.5",
  box: "M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10",
  building: "M4 20.5h16M6 20.5V5.5l7-2v17M13 8.5h5v12M9 8h1.5M9 11.5h1.5M9 15h1.5M15.5 12h.5M15.5 15.5h.5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.8-4 3.8-6.5 7.5-6.5s6.7 2.5 7.5 6.5",
  team: "M8 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19c.5-3 2.7-5 5.5-5 1.4 0 2.6.5 3.6 1.3M21.5 19c-.5-3-2.7-5-5.5-5-2.8 0-5 2-5.5 5",
  card: "M3 6.5h18v11H3zM3 10h18M6.5 14.5h4",
  mail: "M3.5 6h17v12h-17zM3.5 6.5l8.5 6.5 8.5-6.5",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7M12 17.2v.3",
  shield: "M12 3 5 6v5.5c0 4.3 3 7.8 7 9.5 4-1.7 7-5.2 7-9.5V6zM9 12l2.2 2.2L15.5 10",
  plus: "M12 5v14M5 12h14",
  truck: "M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM16.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6",
  copy: "M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  right: "M9 6l6 6-6 6",
  left: "M15 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8v.3",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15",
  upload: "M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15",
  send: "M4 12 20 4l-4 16-4.5-6.5zM11.5 13.5 20 4",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z",
  history: "M4 12a8 8 0 1 0 2.3-5.6M4 4.5v3.5h3.5M12 8v4.5l3 2",
  logout: "M14.5 4.5h-9v15h9M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  wand: "M4.5 19.5 15 9M13.5 6.5l1-3 1 3 3 1-3 1-1 3-1-3-3-1zM18.5 13l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z",
  star: "M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 16.5 7.2 19l.9-5.3-3.9-3.8 5.4-.8z",
  archive: "M3.5 5h17v4h-17zM5 9v10.5h14V9M10 13h4",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  compare: "M8 4v16M16 4v16M4 8h4M16 16h4M4 16h4M16 8h4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  inbox: "M3.5 13.5 6 5h12l2.5 8.5v5h-17zM3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  euro: "M17.5 6.5A6.5 6.5 0 1 0 17.5 17.5M5 10.5h8M5 13.5h8",
  calendar: "M4 6h16v14H4zM4 10h16M8.5 3.5V7M15.5 3.5V7",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z",
  more: "M6 12h.01M12 12h.01M18 12h.01",
  note: "M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4",
  section: "M4 5.5h16M4 10.5h10M4 15.5h10M4 20h16",
  hammer: "M14 4.5 19.5 10l-2 2L12 6.5zM12.5 8 4.5 16a1.8 1.8 0 0 0 2.5 2.5l8-8",
  lock: "M6 10.5h12v10H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3",
  key: "M8 15.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM11 11.5h9.5M17.5 11.5v3M20.5 11.5v2",
  device: "M5 5h14v10H5zM2.5 18.5h19M10 15v3.5M14 15v3.5",
  chart: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3",
  phone: "M7 3.5h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3A2.5 2.5 0 0 1 18 19.5 14.5 14.5 0 0 1 4.5 6 2.5 2.5 0 0 1 7 3.5z",
  pin: "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  mic: "M12 3.5a3 3 0 0 0-3 3V12a3 3 0 0 0 6 0V6.5a3 3 0 0 0-3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6",
  tag: "M3.5 12.5V4h8.5l8.5 8.5-8 8zM8 8.5h.01",
  play: "M8 5.5v13l10-6.5z",
  refresh: "M19.5 8A8 8 0 0 0 5 9M4.5 16A8 8 0 0 0 19 15M19.5 4v4h-4M4.5 20v-4h4",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className = "", title }: { name: IconName | string; size?: number; className?: string; title?: string }) {
  const d = PATHS[name] ?? PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}

/** Logo Pilot-Makers : une équerre et une ligne de devis. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--accent)" />
      <path d="M9 23V9h4" stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M9 23h14" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M15 13.5h8M15 18h5" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}
