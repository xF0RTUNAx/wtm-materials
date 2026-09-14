// themes.js — переключаемые пресеты оформления. "classic" — исходный тёплый терракотовый
// вид (сплошные поверхности, как было). Остальные 5 — на основе присланных палитр,
// в стиле "жидкого стекла" (полупрозрачные карточки + blur поверх цветного градиента).
// Токены для light/dark считаются по формуле из 4 базовых цветов, а не подобраны вручную —
// так пресет можно добавить одной записью в PRESETS.

function _hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function _toHex(v) {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}
function mix(hexA, hexB, t) {
  const a = _hexToRgb(hexA), b = _hexToRgb(hexB);
  return `#${_toHex(a.r + (b.r - a.r) * t)}${_toHex(a.g + (b.g - a.g) * t)}${_toHex(a.b + (b.b - a.b) * t)}`;
}
function rgba(hex, alpha) {
  const c = _hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

const PRESETS = [
  {
    id: "classic",
    label: "Фортуна",
    swatch: "#c8643c",
    glass: false,
    light: {
      bg: "#f5f2ec", surface: "#fbf9f5", surface2: "#f0ece3", border: "#e4ddd0",
      text: "#2a2722", textSoft: "#6b655c", accent: "#c8643c", accentSoft: "#f3e3da",
      btn: "#2a2722", btnText: "#fbf9f5", pageBg: "#f5f2ec",
      tint1: "#f0ece3", tint2: "#f0ece3", tint3: "#f0ece3",
    },
    dark: {
      bg: "#1f1d1a", surface: "#2a2723", surface2: "#333029", border: "#3d3933",
      text: "#ece7df", textSoft: "#a39c8f", accent: "#e08252", accentSoft: "#3a2c23",
      btn: "#ece7df", btnText: "#1f1d1a", pageBg: "#1f1d1a",
      tint1: "#333029", tint2: "#333029", tint3: "#333029",
    },
  },
  // ── Ниже — присланные палитры, каждая: [фон, акцент, второй цвет, тёмный] ──
  themeFromPalette("sand", "Песок", "#E5E1DD", "#407E8C", "#A58D66", "#083A4F"),
  themeFromPalette("azure", "Лазурь", "#F9F9F9", "#FF6E42", "#004E72", "#092634"),
  themeFromPalette("slate", "Асфальт", "#ECF0F1", "#33495D", "#BDC3C7", "#2C3D50"),
  themeFromPalette("emerald", "Изумруд", "#F4F1EB", "#7AA05A", "#2D5A4A", "#0D4C3C"),
  themeFromPalette("amber", "Янтарь", "#EEEEEE", "#EA9216", "#3A4750", "#313841"),
];

function themeFromPalette(id, label, bg, accent, secondary, dark) {
  return {
    id, label, swatch: accent, glass: true,
    light: {
      bg,
      // "стекло" тонировано цветом пресета, а не нейтрально-белое
      surface: rgba(mix(accent, "#ffffff", 0.9), 0.5),
      surface2: rgba(mix(secondary, "#ffffff", 0.78), 0.42),
      border: rgba(mix(accent, "#ffffff", 0.4), 0.45),
      text: dark,
      textSoft: mix(dark, bg, 0.4),
      accent,
      accentSoft: rgba(accent, 0.16),
      btn: dark,
      btnText: bg,
      tint1: rgba(accent, 0.16),
      tint2: rgba(secondary, 0.18),
      tint3: rgba(mix(accent, secondary, 0.5), 0.16),
      pageBg: `linear-gradient(160deg, ${bg} 0%, ${mix(bg, secondary, 0.55)} 45%, ${mix(secondary, accent, 0.4)} 100%)`,
    },
    dark: {
      bg: dark,
      surface: rgba(mix(accent, "#000000", 0.82), 0.48),
      surface2: rgba(mix(secondary, "#000000", 0.7), 0.4),
      border: rgba(mix(accent, "#ffffff", 0.5), 0.2),
      text: mix(dark, "#ffffff", 0.92),
      textSoft: mix(dark, "#ffffff", 0.55),
      accent: mix(accent, "#ffffff", 0.12),
      accentSoft: rgba(accent, 0.24),
      btn: bg,
      btnText: dark,
      tint1: rgba(accent, 0.22),
      tint2: rgba(secondary, 0.28),
      tint3: rgba(mix(accent, secondary, 0.5), 0.22),
      pageBg: `linear-gradient(160deg, ${dark} 0%, ${mix(dark, secondary, 0.5)} 50%, ${mix(secondary, accent, 0.35)} 100%)`,
    },
  };
}

const THEME_KEY = "fortuna_web_theme";

function applyPreset(presetId, { save = true } = {}) {
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const explicit = document.documentElement.getAttribute("data-theme");
  const useDark = explicit === "dark" || (explicit !== "light" && prefersDark);
  const t = useDark ? preset.dark : preset.light;

  const root = document.documentElement.style;
  root.setProperty("--bg", t.bg);
  root.setProperty("--surface", t.surface);
  root.setProperty("--surface-2", t.surface2);
  root.setProperty("--border", t.border);
  root.setProperty("--text", t.text);
  root.setProperty("--text-soft", t.textSoft);
  root.setProperty("--accent", t.accent);
  root.setProperty("--accent-soft", t.accentSoft);
  root.setProperty("--btn", t.btn);
  root.setProperty("--btn-text", t.btnText);
  root.setProperty("--page-bg", t.pageBg);
  root.setProperty("--tint1", t.tint1);
  root.setProperty("--tint2", t.tint2);
  root.setProperty("--tint3", t.tint3);
  document.documentElement.classList.toggle("glass", preset.glass);
  document.body && document.body.setAttribute("data-preset", preset.id);

  if (save) {
    try { localStorage.setItem(THEME_KEY, presetId); } catch (_) {}
  }
  renderThemePicker(preset.id);
}

function currentPresetId() {
  try { return localStorage.getItem(THEME_KEY) || "classic"; } catch (_) { return "classic"; }
}

function renderThemePicker(activeId) {
  const mount = document.getElementById("theme-picker-panel");
  if (!mount) return;
  mount.innerHTML = PRESETS.map(
    (p) => `<button class="theme-swatch ${p.id === activeId ? "active" : ""}" data-preset="${p.id}" style="background:${p.swatch}" title="${p.label}"></button>`,
  ).join("");
  mount.querySelectorAll(".theme-swatch").forEach((btn) => {
    btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
  });
}

function initThemePicker() {
  const btn = document.getElementById("theme-toggle-btn");
  const panel = document.getElementById("theme-picker-panel");
  if (!btn || !panel) return;
  btn.addEventListener("click", () => panel.classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove("open");
  });
  applyPreset(currentPresetId(), { save: false });
}
