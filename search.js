// Each rank has its own score range, even for very long URLs.
export function score(query, text) {
  const value = (text || "").toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return 0;
  if (value === needle) return 3;
  if (value.startsWith(needle)) return 2 + needle.length / value.length;

  let previous = -2;
  let points = 0;
  for (const letter of needle) {
    const index = value.indexOf(letter, previous + 1);
    if (index < 0) return -1;
    if (index === previous + 1) points += 2;
    if (index === 0 || /[^\p{L}\p{N}]/u.test(value[index - 1]) ||
        (/[a-z]/.test(text[index - 1]) && /[A-Z]/.test(text[index]))) points++;
    previous = index;
  }
  return (points + needle.length / (1 + previous)) / (4 * needle.length + 1);
}

export function rankEntries(tabs, commands, query) {
  const empty = !query.trim();
  const matches = tabs.map(tab => {
    const title = score(query, tab.title);
    const url = score(query, tab.url);
    return { tab, best: Math.max(title, url), titleWins: title >= url };
  }).filter(row => row.best >= 0).sort((a, b) =>
    (empty && Number(a.tab.active) - Number(b.tab.active)) ||
    b.best - a.best || Number(b.titleWins) - Number(a.titleWins) ||
    (b.tab.lastAccessed || 0) - (a.tab.lastAccessed || 0) ||
    a.tab.index - b.tab.index
  );
  const actions = commands.map(command => ({
    command, best: Math.max(score(query, command.title), score(query, command.title + " current tab"))
  })).filter(row => row.best >= 0);
  if (empty) {
    matches.splice(1, 0, ...actions);
    return matches;
  }
  return [...actions, ...matches].sort((a, b) => b.best - a.best);
}
