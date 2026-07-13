import { useEffect, useRef, type RefObject } from "react";

const modalBackgroundSelectors = [
  ".app-frame",
  ".bottom-nav",
  ".shopping-mode",
  ".overlay",
  ".toast-region",
];

export const useModalFocusTrap = (
  dialogReference: RefObject<HTMLElement | null>,
  onClose: () => void,
): void => {
  const onCloseReference = useRef(onClose);

  useEffect(() => {
    onCloseReference.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialogElement = dialogReference.current;
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;

    if (!dialogElement) {
      return undefined;
    }

    const backgroundElements = modalBackgroundSelectors
      .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .filter(
        (element, elementIndex, elements) =>
          elements.indexOf(element) === elementIndex &&
          !element.contains(dialogElement),
      );
    const previousInertStates = backgroundElements.map((element) => element.inert);

    backgroundElements.forEach((element) => {
      element.inert = true;
    });

    const getFocusableElements = () =>
      Array.from(
        dialogElement.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );

    getFocusableElements()[0]?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      const openDialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
      );

      if (openDialogs[openDialogs.length - 1] !== dialogElement) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseReference.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      backgroundElements.forEach((element, elementIndex) => {
        element.inert = previousInertStates[elementIndex];
      });
      previouslyFocusedElement?.focus({ preventScroll: true });
    };
  }, [dialogReference]);
};
