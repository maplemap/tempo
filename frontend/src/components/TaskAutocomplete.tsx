import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  descriptions: string[];
}

// Reverse-i-search style: match the typed text anywhere in a description
// (substring). Returns all matches, most-recent-first (same order as
// `descriptions`). Skips a match that is identical to what's typed (nothing
// to complete).
function buildMatches(text: string, descriptions: string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return descriptions.filter((desc) => {
    const dl = desc.toLowerCase();
    return dl !== lower && dl.includes(lower);
  });
}

// Split a suggestion around the matched substring so the match can be
// emphasized (bck-i-search shows the whole line with the search term inside it).
function emphasize(suggestion: string, text: string) {
  const idx = suggestion.toLowerCase().indexOf(text.toLowerCase());
  if (idx < 0) return <>{suggestion}</>;
  return (
    <>
      {suggestion.slice(0, idx)}
      <span className="task-hint-match">{suggestion.slice(idx, idx + text.length)}</span>
      {suggestion.slice(idx + text.length)}
    </>
  );
}

export default function TaskAutocomplete({ value, onChange, onEnter, descriptions }: Props) {
  const [matches, setMatches] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const suggestion = matches[index] ?? '';

  // Recompute matches whenever value or descriptions change; always reset
  // back to the top (most recent) match.
  useEffect(() => {
    setMatches(buildMatches(value, descriptions));
    setIndex(0);
  }, [value, descriptions]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setMatches(buildMatches(v, descriptions));
    setIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      onChange(suggestion);
      setMatches([]);
    } else if (e.key === 'ArrowDown' && matches.length > 1) {
      e.preventDefault();
      setIndex((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp' && matches.length > 1) {
      e.preventDefault();
      setIndex((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Escape') {
      setMatches([]);
    } else if (e.key === 'Enter') {
      // Capture final before onChange: parent state update is async, onEnter reads this value directly
      const final = suggestion || value;
      if (suggestion) {
        onChange(suggestion);
        setMatches([]);
      }
      onEnter(final);
    }
  }

  // Inline ghost tail only works when the suggestion starts with the typed text
  // (the completion is appended after the cursor). For a substring match the
  // matched part sits mid-string, so we fall back to a full-line hint below.
  const isPrefix = !!suggestion && suggestion.toLowerCase().startsWith(value.toLowerCase());
  const tail = isPrefix ? suggestion.slice(value.length) : '';
  const counterHint = matches.length > 1 ? ` · ${index + 1}/${matches.length} · ↑↓` : '';

  return (
    <div style={{ position: 'relative' }}>
      {tail && (
        <div className="task-ghost" aria-hidden="true">
          <span style={{ visibility: 'hidden' }}>{value}</span>
          <span className="task-ghost-tail">{tail}</span>
        </div>
      )}
      <input
        className="input"
        placeholder="e.g. review PR #1301"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {suggestion && !isPrefix ? (
        <span className="muted task-hint">
          {emphasize(suggestion, value)}
          <span className="task-hint-key">{counterHint} · Tab</span>
        </span>
      ) : (
        <span
          className="muted"
          style={{ fontSize: 11, display: 'block', marginTop: 2, visibility: tail ? 'visible' : 'hidden' }}
        >
          press Tab to complete{counterHint}
        </span>
      )}
    </div>
  );
}
