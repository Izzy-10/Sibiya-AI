// Colour themes. The chosen theme is remembered on this device and applied straight away.
export const THEMES = [
  { key: "classic", label: "Classic", dot: "#C9A44C", page: "#0B0B0C" },
  { key: "luxury", label: "Luxury", dot: "#1B4332", page: "#F3EFE6" },
  { key: "startup", label: "Startup", dot: "#4F46E5", page: "#F5F7FB" },
  { key: "warm", label: "Warm", dot: "#C2410C", page: "#F6EEE3" },
  { key: "dark", label: "Dark", dot: "#5B8DEF", page: "#0E0F12" },
];

const KEY = "sibiya_theme";

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return THEMES.some(x => x.key === t) ? t : "classic";
  } catch {
    return "classic";
  }
}

export function applyTheme(key) {
  if (typeof document === "undefined") return;
  const theme = THEMES.find(t => t.key === key) || THEMES[0];
  document.documentElement.setAttribute("data-theme", theme.key);
  // colour the phone's browser bar to match
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", theme.page);
}

export function setTheme(key) {
  try {
    localStorage.setItem(KEY, key);
  } catch {}
  applyTheme(key);
}

// apply as soon as this file loads, so the page does not flash the wrong colours
applyTheme(getTheme());
