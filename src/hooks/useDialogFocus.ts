import { useEffect, useRef } from "react";
import type { RefObject } from "react";

// Shared ownership keeps stacked dialogs from closing together or restoring the
// background while another dialog is still open.
const modalStack: HTMLElement[] = [];
const modalInertOwners = new WeakMap<HTMLElement, { count: number; previous: boolean }>();
let modalScrollOwners = 0;
let previousBodyOverflow = "";

/** One focus owner for workspace dialogs and assistant drawers. */
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    modalStack.push(dialog);
    const inertSiblings: HTMLElement[] = [];
    let branch: HTMLElement = dialog.parentElement ?? dialog;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE") continue;
        const owner = modalInertOwners.get(sibling) ?? { count: 0, previous: sibling.inert };
        owner.count += 1;
        modalInertOwners.set(sibling, owner);
        sibling.inert = true;
        inertSiblings.push(sibling);
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    if (modalScrollOwners++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[contenteditable='true']",
      "[tabindex]:not([tabindex='-1']):not([disabled])"
    ].join(",");
    const focusableElements = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
    ).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true" && !element.closest("[inert]"));

    const focusFrame = window.requestAnimationFrame(() => {
      if (!dialog?.contains(document.activeElement)) {
        dialog.focus({ preventScroll: true });
      }
    });

    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKey);
      const index = modalStack.indexOf(dialog);
      if (index >= 0) modalStack.splice(index, 1);
      for (const sibling of inertSiblings) {
        const owner = modalInertOwners.get(sibling);
        if (!owner) continue;
        if (--owner.count === 0) {
          sibling.inert = owner.previous;
          modalInertOwners.delete(sibling);
        }
      }
      if (--modalScrollOwners === 0) document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected && !previouslyFocused.closest("[inert]")) previouslyFocused.focus();
      else modalStack[modalStack.length - 1]?.focus();
    };
  }, [active, dialogRef]);
}
