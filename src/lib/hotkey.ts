const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);
const FUNCTION_KEY_PATTERN = /^F([1-9]|1[0-2])$/;

function normalizeModifierOrder(modifiers: string[]): string[] {
  const ordered = ['ctrl', 'alt', 'shift'];
  return ordered.filter((modifier) => modifiers.includes(modifier));
}

function normalizePrimaryKey(key: string): string | null {
  if (FUNCTION_KEY_PATTERN.test(key)) {
    return key.toLowerCase();
  }

  if (key === ' ') {
    return 'space';
  }

  if (key.length === 1) {
    const normalized = key.toLowerCase();
    if (/^[a-z0-9]$/.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

export function formatHotkeyForDisplay(value: string): string {
  return value
    .split('+')
    .map((segment) => {
      const normalized = segment.trim().toLowerCase();
      if (normalized === 'ctrl') return 'Ctrl';
      if (normalized === 'alt') return 'Alt';
      if (normalized === 'shift') return 'Shift';
      if (normalized === 'space') return 'Space';
      if (FUNCTION_KEY_PATTERN.test(normalized.toUpperCase())) return normalized.toUpperCase();
      return normalized.toUpperCase();
    })
    .join(' + ');
}

export function hotkeyFromKeyboardEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  const modifiers = normalizeModifierOrder([
    event.ctrlKey ? 'ctrl' : '',
    event.altKey ? 'alt' : '',
    event.shiftKey ? 'shift' : '',
    event.metaKey ? 'meta' : ''
  ].filter(Boolean));

  const primaryKey = normalizePrimaryKey(event.key);
  if (!primaryKey) {
    return null;
  }

  if (!FUNCTION_KEY_PATTERN.test(primaryKey.toUpperCase()) && modifiers.length === 0) {
    return null;
  }

  return [...modifiers, primaryKey].join('+');
}
