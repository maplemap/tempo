import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  descriptions: string[];
}

// Reverse-i-search style: match the typed text anywhere in a description
// (substring), returning the first — best — full match. Skips a match that is
// identical to what's typed (nothing to complete).
function buildSuggestion(text: string, descriptions: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const desc of descriptions) {
    const dl = desc.toLowerCase();
    if (dl !== lower && dl.includes(lower)) {
      return desc;
    }
  }
  return '';
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
  const [suggestion, setSuggestion] = useState('');

  // Recompute suggestion whenever value or descriptions change
  useEffect(() => {
    setSuggestion(buildSuggestion(value, descriptions));
  }, [value, descriptions]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    setSuggestion(buildSuggestion(v, descriptions));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      onChange(suggestion);
      setSuggestion('');
    } else if (e.key === 'Escape') {
      setSuggestion('');
    } else if (e.key === 'Enter') {
      // Capture final before onChange: parent state update is async, onEnter reads this value directly
      const final = suggestion || value;
      if (suggestion) {
        onChange(suggestion);
        setSuggestion('');
      }
      onEnter(final);
    }
  }

  // Inline ghost tail only works when the suggestion starts with the typed text
  // (the completion is appended after the cursor). For a substring match the
  // matched part sits mid-string, so we fall back to a full-line hint below.
  const isPrefix = !!suggestion && suggestion.toLowerCase().startsWith(value.toLowerCase());
  const tail = isPrefix ? suggestion.slice(value.length) : '';

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
          <span className="task-hint-key"> · Tab</span>
        </span>
      ) : (
        <span
          className="muted"
          style={{ fontSize: 11, display: 'block', marginTop: 2, visibility: tail ? 'visible' : 'hidden' }}
        >
          press Tab to complete
        </span>
      )}
    </div>
  );
}
