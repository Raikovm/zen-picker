<img src="assets/icon.svg" width="64" height="64" alt="">

# Zen Picker

Press **Alt+Shift+K** to search the current Zen window's tabs by title or URL. With the search field empty, Enter switches to the most recently used alternative tab. The toolbar button opens the same centered palette. On protected pages such as Zen settings, the palette opens in a separate, centered window.

Tabs and actions appear in one list. Type a tab title or URL to switch, or search for an action such as **Pin current tab**. Each action shows the title of the tab you were viewing when you opened the picker.

Use ↑ and ↓ to choose an entry and Enter to run it, or click it. Close requires an explicit selection with an arrow key or a click. Escape dismisses the picker.

## Load in Zen

Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select this project's `manifest.json`. To change the shortcut, open **Manage Extension Shortcuts** from the gear menu in `about:addons`.

The picker uses the tabs permission to list tabs. The activeTab and scripting permissions let it show the palette on the page where you invoke it. Titles and URLs stay in memory. 

## Check and package

```sh
npx web-ext lint --ignore-files README.md
npx web-ext build --overwrite-dest --ignore-files README.md
```

The unsigned zip is written to `web-ext-artifacts/`.
