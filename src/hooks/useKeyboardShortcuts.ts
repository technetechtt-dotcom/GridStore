import { useEffect } from 'react';

type ShortcutHandler = () => void;

const shortcuts = new Map<string, ShortcutHandler>();

export function registerShortcut(key: string, handler: ShortcutHandler) {
  shortcuts.set(key.toLowerCase(), handler);
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (meta && key === 'k') {
        event.preventDefault();
        shortcuts.get('mod+k')?.();
        return;
      }

      if (event.key === '?' && !meta) {
        event.preventDefault();
        shortcuts.get('?')?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
