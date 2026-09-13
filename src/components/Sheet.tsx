"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

export function Sheet({
  title,
  children,
  trigger,
  className = "btn-primary",
  open = false,
  icon,
}: {
  title: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
  open?: boolean;
  icon?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button
        type="button"
        title={title}
        className={className}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger ?? (
          <>
            <Icon name="plus" size={20} />
            {title}
          </>
        )}
      </button>
      <dialog
        ref={dialog}
        className="sheet"
        aria-label={title}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="icon-circle">
                <Icon name={icon} />
              </span>
            )}
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрити панель"
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </dialog>
    </>
  );
}
