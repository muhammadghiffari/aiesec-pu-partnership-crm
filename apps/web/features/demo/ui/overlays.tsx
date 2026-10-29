"use client";

/**
 * Accessible overlay primitives (modal dialog, confirmation dialog, drawer,
 * anchored popover) built on the native <dialog> element for focus trapping,
 * Escape handling and backdrop behavior.
 */
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Button, cn } from "./primitives";

/* ------------------------------- Modal ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      const focusable = el.querySelector<HTMLElement>(
        "input, select, textarea, button:not([data-close]):not(:disabled)",
      );
      focusable?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === el) onClose();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [onClose]);

  if (!open) return null;

  return (
    // Dialogs are labelled by their visible title text.
    <dialog
      ref={ref}
      className={cn("cmodal", size === "lg" && "cmodal-lg", size === "sm" && "cmodal-sm")}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div className="cmodal-hd">
        <div className="cmodal-titles">
          <h2 className="cmodal-title">{title}</h2>
          {description ? <div className="cmodal-desc">{description}</div> : null}
        </div>
        <button
          type="button"
          className="iconbtn"
          aria-label="Close dialog"
          data-close
          onClick={onClose}
        >
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="cmodal-bd">{children}</div>
      {footer ? <div className="cmodal-ft">{footer}</div> : null}
    </dialog>
  );
}

/* ------------------------------ ConfirmDialog ------------------------ */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  extra,
  confirmDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  extra?: React.ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>{cancelLabel}</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{message}</p>
      {extra}
    </Modal>
  );
}

/* ------------------------------- Drawer ------------------------------ */

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === el) onClose();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("click", onClick);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("click", onClick);
    };
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="cdrawer"
      aria-label={typeof title === "string" ? title : "Details"}
    >
      <div className="cdrawer-hd">
        <div className="cmodal-titles">
          <h2 className="cmodal-title">{title}</h2>
          {sub ? <div className="cmodal-desc">{sub}</div> : null}
        </div>
        {actions}
        <button
          type="button"
          className="iconbtn"
          aria-label="Close panel"
          data-close
          onClick={onClose}
        >
          <Icon name="x" size={15} />
        </button>
      </div>
      <div className="cdrawer-bd">{children}</div>
      {footer ? <div className="cdrawer-ft">{footer}</div> : null}
    </dialog>
  );
}

/* ------------------------------- Popover ----------------------------- */

export function Popover({
  trigger,
  children,
  align = "right",
  ariaLabel,
  open,
  onOpenChange,
  width,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  ariaLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      {trigger}
      {open ? (
        <div
          className="menu"
          role="dialog"
          aria-label={ariaLabel ?? "Menu"}
          style={{
            [align === "left" ? "left" : "right"]: 0,
            width: width ? `${width}px` : undefined,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
