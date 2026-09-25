import { escapeHtml as e, icon, safeColor, playerName } from "./ui.js";
import { getLegalTargets } from "./engine.js";
export function renderMap(
  state,
  selectedId,
  { attackMode = false, playerId, editMode = false } = {},
) {
  const selected = state.territories.find((t) => t.id === selectedId);
  const neighbours = state.connections
    .filter((c) => c.territory_a === selectedId || c.territory_b === selectedId)
    .map((c) => (c.territory_a === selectedId ? c.territory_b : c.territory_a));
  const legal = attackMode ? getLegalTargets(state, playerId) : [];
  return `<div class="planet-map ${editMode ? "editing" : ""} ${attackMode ? "attack-mode" : ""}" id="planet-map"><div class="orbital-ring ring-one"></div><div class="orbital-ring ring-two"></div><div class="planet-surface"></div><svg class="map-links" viewBox="0 0 100 100" aria-hidden="true">${state.connections
    .map((c) => {
      const a = state.territories.find((t) => t.id === c.territory_a),
        b = state.territories.find((t) => t.id === c.territory_b);
      return a && b
        ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${a.id === selectedId || b.id === selectedId ? "selected-link" : ""}"/>`
        : "";
    })
    .join("")}</svg><div class="map-markers">${state.territories
    .map((t) => {
      const owner = state.players.find((p) => p.id === t.owner_id),
        active = state.battles.some(
          (b) => b.territory_id === t.id && b.status === "active",
        );
      return `<button class="territory-marker ${t.id === selectedId ? "selected" : ""} ${neighbours.includes(t.id) ? "neighbour" : ""} ${t.contested ? "contested" : ""} ${legal.includes(t.id) ? "legal-target" : ""} ${t.owner_id ? "" : "neutral"}" data-territory="${t.id}" style="left:${t.x}%;top:${t.y}%;--owner:${safeColor(owner?.color)}" aria-label="${e(t.name)}, ${e(playerName(state, t.owner_id))}${t.contested ? ", contested" : ""}${active ? ", active battle" : ""}" title="${e(t.name)} · ${e(playerName(state, t.owner_id))}" ${editMode ? 'draggable="false"' : ""}><span class="marker-dot">${icon(active ? "swords" : t.headquarters_for ? "flag" : t.fortified ? "shield" : t.strategic_value >= 3 ? "star" : "target")}</span><span class="marker-label">${e(t.name)}${active ? "<small>ENGAGEMENT ACTIVE</small>" : ""}</span></button>`;
    })
    .join(
      "",
    )}</div><div class="map-coordinate coord-n">N / 00.000</div><div class="map-coordinate coord-s">S / 180.000</div><div class="map-coordinate coord-w">270° W</div><div class="map-coordinate coord-e">090° E</div></div>`;
}
export function bindMap(state, onSelect, { editMode = false, onMove } = {}) {
  const map = document.querySelector("#planet-map");
  if (!map) return;
  map.querySelectorAll("[data-territory]").forEach((button) => {
    button.onclick = () => onSelect(button.dataset.territory);
    if (!editMode) return;
    button.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = map.getBoundingClientRect();
      let moved = false;
      button.setPointerCapture(event.pointerId);
      button.onpointermove = (ev) => {
        moved = true;
        button.style.left = `${Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100))}%`;
        button.style.top = `${Math.max(5, Math.min(95, ((ev.clientY - rect.top) / rect.height) * 100))}%`;
      };
      button.onpointerup = async () => {
        button.onpointermove = null;
        button.onpointerup = null;
        if (moved) {
          button.onclick = null;
          await onMove(
            button.dataset.territory,
            parseFloat(button.style.left),
            parseFloat(button.style.top),
          );
        } else onSelect(button.dataset.territory);
      };
    };
  });
}
