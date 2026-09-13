import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function MobileSheet({
  title,
  onClose,
  children,
  expanded = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  expanded?: boolean;
}) {
  const { t } = useTranslation();
  const [full, setFull] = useState(expanded);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div className="a-mobile-sheet-layer">
      <button
        className="a-mobile-sheet-backdrop"
        aria-label={t('assembly.close')}
        onClick={onClose}
      />
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`a-mobile-sheet ${full ? 'is-expanded' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          } else if (event.key === 'Tab') {
            const focusable = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), summary, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ) ?? [],
            ).filter(
              (element) =>
                !element.closest(
                  '[hidden], .a-collapse, .a-inspector-heading, .a-detail-drawer > header',
                ) &&
                (element.tagName === 'SUMMARY' ||
                  !element.closest('details:not([open])')),
            );
            if (!focusable?.length) return;
            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header className="a-mobile-sheet-header">
          <strong>{title}</strong>
          <div>
            <button
              className="a-icon"
              aria-label={t(
                full ? 'assembly.minimizeDetail' : 'assembly.focusDetail',
              )}
              onClick={() => setFull((value) => !value)}
            >
              {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              className="a-icon"
              aria-label={t('assembly.close')}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="a-mobile-sheet-body">{children}</div>
      </section>
    </div>
  );
}
