export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Unscheduled";
export const playerName = (state, id) =>
  state.players.find((p) => p.id === id)?.name || "Neutral";
export const factionName = (state, id) =>
  state.factions.find((p) => p.id === id)?.name || "Unassigned";
export const field = (label, input) =>
  `<label class="field"><span>${escapeHtml(label)}</span>${input}</label>`;
const paths = {
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
  swords:
    '<path d="m4 3 15 15m-5 0 5-5m1 8-4-4M20 3 5 18m0-5 5 5m-6 3 4-4M4 3l1 5 3-3m12-2-1 5-3-3"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1v15M6 8h3m6 0h3M6 12h3m6 0h3"/>',
  shield:
    '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 11 3 3 5-5"/>',
  chart: '<path d="M3 3v18h18M7 16v-5m5 5V6m5 10V9"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 3 1 4 4 3 3-2 4-1 3-4-2-3-1-4-4-3-4 2Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  target:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  flag: '<path d="M5 22V3h14l-3 5 3 5H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v6h-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8z"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12S5 5 12 5s10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
};
export const icon = (name) =>
  `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.flag}</svg>`;
let lastFocus;
export function modal(title, html, { wide = false } = {}) {
  const dialog = document.querySelector("#modal");
  if (!dialog.open) lastFocus = document.activeElement;
  dialog.classList.toggle("wide", wide);
  document.querySelector("#modal-content").innerHTML =
    `<div class="modal-head"><div><span class="eyebrow">CHRISTOPIA // COMMAND TERMINAL</span><h2 id="dialog-title">${escapeHtml(title)}</h2></div><button type="button" class="icon-btn" aria-label="Close dialog" id="close-modal">${icon("close")}</button></div><div class="modal-body">${html}</div>`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  if (!dialog.open) dialog.showModal();
  document.querySelector("#close-modal").onclick = closeModal;
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        closeModal();
    }
  };
  dialog.onclose = () => lastFocus?.focus();
  return dialog;
}
export function closeModal() {
  document.querySelector("#modal").close();
}
export function toast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  document.querySelector("#toasts").append(el);
  setTimeout(() => el.remove(), type === "error" ? 9000 : 4500);
}
export function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#8b9289";
}
export function safeImage(value) {
  return /^(https?:|blob:|data:image\/(jpeg|png|webp);base64,)/i.test(
    value || "",
  )
    ? escapeHtml(value)
    : "";
}
