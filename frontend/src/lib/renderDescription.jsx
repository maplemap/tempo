export function renderDescription(description, { links, githubRepo } = {}) {
  if (!description) return <span className="muted">(no description)</span>;

  const urlByPR = {};
  for (const l of links || []) {
    const m = l.url.match(/\/pull\/(\d+)$/);
    if (m) urlByPR[m[1]] = l.url;
  }

  const parts = [];
  let last = 0;
  const re = /(?:PR\s*#?|#)(\d+)/gi;
  let m;
  while ((m = re.exec(description)) !== null) {
    if (m.index > last) parts.push(description.slice(last, m.index));
    const url = urlByPR[m[1]] || (githubRepo ? `https://github.com/${githubRepo}/pull/${m[1]}` : null);
    parts.push(url
      ? <a key={m.index} href={url} target="_blank" rel="noopener noreferrer" className="entry-link-inline" onClick={(e) => e.stopPropagation()}>{m[0]}</a>
      : m[0]
    );
    last = m.index + m[0].length;
  }
  if (last < description.length) parts.push(description.slice(last));
  return parts;
}
