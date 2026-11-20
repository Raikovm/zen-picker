import { rankEntries } from "./search.js";

function actions(tab) {
  return [
    { id: "duplicate", title: "Duplicate" },
    { id: "pin", title: tab.pinned ? "Unpin" : "Pin", pinned: !tab.pinned },
    { id: "mute", title: tab.mutedInfo?.muted ? "Unmute" : "Mute", muted: !tab.mutedInfo?.muted },
    { id: "reload", title: "Reload" },
    { id: "close", title: "Close" }
  ];
}

function span(text, className) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", "#" + name);
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
}

function tabIcon(tab) {
  if (!tab.favIconUrl) return icon("page");
  const image = document.createElement("img");
  image.className = "favicon";
  image.alt = "";
  image.width = 16;
  image.height = 16;
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => image.replaceWith(icon("page")), { once: true });
  image.src = tab.favIconUrl;
  return image;
}

function mount(root, close) {
  const port = browser.runtime.connect({ name: "zen-picker" });
  let closed = false;
  function dismiss() {
    if (closed) return;
    closed = true;
    window.removeEventListener("focus", focusQuery);
    cancelAnimationFrame(focusFrame);
    port.disconnect();
    close();
  }
  const byId = id => root.getElementById(id);
  const query = byId("query");
  const results = byId("results");
  const status = byId("status");
  let tabs = [];
  let rows = [];
  let selected = -1;
  let openedTabId;
  let busy = false;

  function highlight(index) {
    results.children[selected]?.setAttribute("aria-selected", "false");
    selected = index;
    const option = results.children[index];
    byId("verb").textContent = rows[index]?.command?.title || "Switch";
    if (!option) {
      query.removeAttribute("aria-activedescendant");
      return;
    }
    option.setAttribute("aria-selected", "true");
    query.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest" });
  }

  function render(message = "") {
    const opened = tabs.find(tab => tab.id === openedTabId);
    rows = rankEntries(tabs, opened ? actions(opened) : [], query.value);
    results.replaceChildren(...rows.map(({ tab, command }, index) => {
      const row = document.createElement("div");
      row.id = "entry-" + index;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.append(command ? icon(command.id) : tabIcon(tab));
      const details = span("", "details");
      const target = tab || opened;
      const name = target.title || target.url || "Untitled tab";
      details.append(span(command ? command.title + " current tab" : name, "title"));
      const subtitle = command ? name : (tab.url || "").replace(/^https?:\/\//i, "");
      details.append(span(subtitle, "url"));
      row.append(details);
      row.title = command ? command.title + " · " + name : tab.url || name;
      if (tab?.pinned) row.append(span("Pinned", "badge"));
      if (tab?.active) row.append(span("Current", "badge"));
      row.addEventListener("mousedown", event => event.preventDefault());
      row.addEventListener("click", () => {
        if (busy) return;
        highlight(index);
        execute();
      });
      return row;
    }));
    selected = -1;
    highlight(rows.findIndex(row => row.command?.id !== "close"));
    status.textContent = [message, rows.length ? "" : "No matches"].filter(Boolean).join(" ");
  }

  function execute() {
    if (busy || !rows[selected]) return;
    const { tab, command } = rows[selected];
    busy = true;
    query.readOnly = true;
    port.postMessage({ command: command?.id || "switch", id: tab?.id, value: command?.pinned ?? command?.muted });
  }

  query.addEventListener("input", () => render());
  query.addEventListener("keydown", event => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (busy) return;
    switch (event.key) {
      case "ArrowDown":
        if (rows.length) highlight((selected + 1) % rows.length);
        break;
      case "ArrowUp":
        if (rows.length) highlight((Math.max(0, selected) + rows.length - 1) % rows.length);
        break;
      case "Enter":
        if (!event.repeat) execute();
        break;
      case "Escape":
        dismiss();
        break;
    }
  });

  port.onMessage.addListener(message => {
    if (message.dismiss) return dismiss();
    tabs = message.tabs;
    openedTabId = message.openedTabId;
    busy = false;
    query.readOnly = false;
    render(message.message);
  });
  port.onDisconnect.addListener(dismiss);
  function focusQuery() {
    query.focus({ preventScroll: true });
  }
  window.addEventListener("focus", focusQuery);
  window.focus();
  focusQuery();
  const focusFrame = requestAnimationFrame(focusQuery);
  return dismiss;
}

let activeOverlay;
export async function openOverlay(markup, css) {
  if (document.hidden) return true;
  if (activeOverlay) {
    activeOverlay();
    return true;
  }
  const previous = document.activeElement;
  const host = document.createElement("div");
  host.style.setProperty("all", "initial", "important");
  const root = host.attachShadow({ mode: "closed" });
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Zen Picker");
  const template = new DOMParser().parseFromString(markup, "text/html");
  dialog.append(template.querySelector("main"), template.querySelector(".symbols"));
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [sheet];
  root.append(dialog);
  document.documentElement.append(host);
  try {
    dialog.showModal();
    // Center on Zen's window, accounting for the sidebar and toolbars.
    function center() {
      const offset = (delta, room) => Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, room / 2));
      const dx = window.screenX + window.outerWidth / 2 - window.mozInnerScreenX - window.innerWidth / 2;
      const dy = window.screenY + window.outerHeight / 2 - window.mozInnerScreenY;
      dialog.style.translate = offset(dx, window.innerWidth - dialog.offsetWidth - 16) + "px";
      if (Number.isFinite(dy)) dialog.style.setProperty("--center-y", dy + "px");
    }
    const onVisibilityChange = () => {
      if (document.hidden) dismiss();
    };
    const dismiss = mount(root, () => {
      window.removeEventListener("resize", center);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      dialog.close();
      host.remove();
      activeOverlay = null;
      window.removeEventListener("pagehide", dismiss);
      previous?.focus?.({ preventScroll: true });
    });
    activeOverlay = dismiss;
    center();
    document.addEventListener("visibilitychange", onVisibilityChange);
    for (const type of ["keydown", "keyup", "keypress", "input"]) {
      dialog.addEventListener(type, event => event.stopPropagation());
    }
    window.addEventListener("resize", center);
    dialog.addEventListener("cancel", event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dismiss();
    });
    window.addEventListener("pagehide", dismiss, { once: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (activeOverlay !== dismiss || document.hidden) return true;
    // Browser chrome can retain keyboard focus even with a focused DOM input.
    // Use the standalone picker when Zen keeps focus outside the document.
    if (document.hasFocus() && root.activeElement === root.getElementById("query")) return true;
    dismiss();
    return false;
  } catch (error) {
    host.remove();
    throw error;
  }
}

export function openWindowPicker() {
  mount(document, () => window.close());
}
