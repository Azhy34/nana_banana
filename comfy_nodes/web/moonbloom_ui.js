// Moonbloom: open (and optionally run) a board in this ComfyUI window when the assistant asks.
// Server side: comfy_nodes/ui_bridge.py + bridge_logic.py (POST /moonbloom/open broadcasts the "moonbloom.open" event).
//
// ONE BOARD = ONE TAB (owner 05.11: the old bridge piled up a tab per call and the window became heavy).
// Why tabs used to multiply (ComfyUI frontend, workflowService.ts): app.loadApiJson(graph, name) reuses a tab only when the tab
// with that name is the ACTIVE one; otherwise it creates "name (2)", "name (3)". So we first find the board's tab by its fixed
// title and switch to it, and only then load the board: it is reused, no new tab. A new tab is created once, for the first load.
// After every open a small report (which tabs exist now) is written to ComfyUI's user folder: user/default/moonbloom_ui_report.json
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function toast(severity, detail, life) {
  try {
    app.extensionManager.toast.add({ severity, summary: "Moonbloom", detail, life });
  } catch (e) {
    console.log("[Moonbloom]", detail);
  }
}

// The workflow (tab) store of the frontend. Not part of the documented extension API, so every use is guarded.
function tabStore() {
  try {
    return app.extensionManager?.workflow ?? null;
  } catch (e) {
    return null;
  }
}

function openTabPaths() {
  try {
    return (tabStore()?.openWorkflows ?? []).map((w) => w.path);
  } catch (e) {
    return [];
  }
}

// Switch to the board's tab when it exists but is not the active one. Returns what was found.
async function focusTab(title) {
  const store = tabStore();
  if (!store || typeof store.getWorkflowByPath !== "function") return { api: false, found: false, switched: false };
  const existing = store.getWorkflowByPath(`workflows/${title}.json`);
  if (!existing) return { api: true, found: false, switched: false };
  const active = typeof store.isActive === "function" ? store.isActive(existing) : false;
  if (!active) await store.openWorkflow(existing);
  return { api: true, found: true, switched: !active };
}

async function writeReport(report) {
  try {
    await api.fetchApi("/userdata/moonbloom_ui_report.json?overwrite=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: new Date().toISOString(), ...report }, null, 1),
    });
  } catch (e) {
    console.warn("[Moonbloom] could not write the tab report", e);
  }
}

async function openBoard({ name, tab, graph, run }) {
  const title = tab || name;
  try {
    const before = openTabPaths();
    const focus = await focusTab(title);
    await app.loadApiJson(graph, title); // reuses the (now active) tab of the same name; creates it only the first time
    if (run) await app.queuePrompt(0, 1);
    const after = openTabPaths();
    console.log("[Moonbloom] board", title, focus, run ? "and queued it" : "");
    if (!focus.api) toast("warn", "Не удалось проверить вкладки (нет доступа к списку вкладок), доска загружена по имени", 8000);
    await writeReport({ title, run: !!run, ...focus, tabs_before: before.length, tabs_after: after.length, tabs: after });
  } catch (e) {
    console.error("[Moonbloom] failed to open board", title, e);
    await writeReport({ title, error: String(e) });
  }
}

app.registerExtension({
  name: "Moonbloom.OpenWorkflow",
  async setup() {
    // The server reloaded the node code (hot reload, comfy_nodes/hot_reload.py): refresh the node definitions.
    api.addEventListener("moonbloom.reloaded", async (event) => {
      const res = event.detail;
      if (res.ok) {
        try {
          await app.extensionManager.command.execute("Comfy.RefreshNodeDefinitions");
        } catch (e) {
          console.warn("[Moonbloom] could not refresh node definitions", e);
        }
        toast("success", `Ноды Moonbloom обновлены (${res.nodes.length})`, 3000);
      } else {
        toast("error", `Правка не загружена, работает прежняя версия: ${res.error}`, 15000);
      }
    });
    // Opens are handled one after another: two at once would race on the tab switch.
    let chain = Promise.resolve();
    api.addEventListener("moonbloom.open", (event) => {
      chain = chain.then(() => openBoard(event.detail));
    });
  },
});
