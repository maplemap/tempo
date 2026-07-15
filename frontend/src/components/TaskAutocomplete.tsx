import { useEffect, useState } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onEnter: (finalValue: string) => void;
  descriptions: string[];
}

function buildSuggestion(text: string, descriptions: string[]): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const desc of descriptions) {
    if (desc.toLowerCase().startsWith(lower) && desc.length > text.length) {
      return desc;
    }
  }
  return '';
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

  const tail = suggestion ? suggestion.slice(value.length) : '';

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
      {tail && (
        <span className="muted" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
          press Tab to complete
        </span>
      )}
    </div>
  );
}
