const template = Promise.all(["popup.html", "popup.css"].map(async path =>
  (await fetch(browser.runtime.getURL(path))).text()
));

async function showOverlay(markup, css) {
  const { openOverlay } = await import(browser.runtime.getURL("popup.js"));
  return openOverlay(markup, css);
}

browser.action.onClicked.addListener(async tab => {
  const [markup, css] = await template;
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id }, func: showOverlay, args: [markup, css]
    });
    if (result?.result === true) return;
  } catch {
    // Zen protects internal pages from content-script injection.
  }
  const parent = await browser.windows.get(tab.windowId);
  // Match the overlay sizing and leave room for the popup frame and margins.
  const paletteWidth = Math.min(840, Math.max(520, Math.round(parent.width * 0.48)));
  const width = Math.min(parent.width, paletteWidth + 40);
  const height = Math.min(470, parent.height);
  const url = new URL(browser.runtime.getURL("popup.html"));
  url.searchParams.set("window", tab.windowId);
  url.searchParams.set("tab", tab.id);
  const picker = await browser.windows.create({
    type: "popup", url: url.href, incognito: tab.incognito, allowScriptsToClose: true,
    width, height, left: Math.round(parent.left + (parent.width - width) / 2),
    top: Math.round(parent.top + (parent.height - height) / 2)
  });
  await browser.windows.update(picker.id, { focused: true });
});

browser.runtime.onConnect.addListener(port => {
  if (port.name !== "zen-picker") return;
  const url = new URL(port.sender.url);
  const standalone = url.origin === new URL(browser.runtime.getURL("/")).origin &&
    url.pathname === "/popup.html";
  const windowId = standalone ? Number(url.searchParams.get("window")) : port.sender.tab?.windowId;
  const openedTabId = standalone ? Number(url.searchParams.get("tab")) : port.sender.tab?.id;
  let connected = true;
  port.onDisconnect.addListener(() => { connected = false; });
  const send = message => { if (connected) port.postMessage(message); };
  async function refresh(message = "") {
    const tabs = await browser.tabs.query({ windowId });
    send({ tabs, openedTabId, message });
  }
  port.onMessage.addListener(async ({ command, id, value }) => {
    try {
      const target = command === "switch" ? id : openedTabId;
      const tab = await browser.tabs.get(target);
      if (tab.windowId !== windowId) throw new Error("That tab has moved.");
      switch (command) {
        case "switch": await browser.tabs.update(target, { active: true }); break;
        case "duplicate": await browser.tabs.duplicate(target); break;
        case "close": await browser.tabs.remove(target); break;
        case "reload": await browser.tabs.reload(target); break;
        case "pin": await browser.tabs.update(target, { pinned: value }); break;
        case "mute": await browser.tabs.update(target, { muted: value }); break;
        default: return;
      }
      if (["switch", "duplicate", "close"].includes(command)) send({ dismiss: true });
      else await refresh();
    } catch (error) {
      await refresh(/Invalid tab ID/i.test(error.message) ? "That tab is gone." : error.message)
        .catch(() => send({ dismiss: true }));
    }
  });
  refresh().catch(error => send({ message: error.message, tabs: [], openedTabId }));
});
