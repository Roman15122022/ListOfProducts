import { useEffect } from "react";

type BodyStyles = Pick<
  CSSStyleDeclaration,
  "overflow" | "position" | "top" | "right" | "left" | "width"
>;

let activeLockCount = 0;
let lockedScrollPosition = 0;
let savedBodyStyles: BodyStyles | null = null;

const lockBody = (): void => {
  activeLockCount += 1;

  if (activeLockCount > 1) {
    return;
  }

  const body = document.body;
  lockedScrollPosition = window.scrollY;
  savedBodyStyles = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    right: body.style.right,
    left: body.style.left,
    width: body.style.width,
  };

  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${lockedScrollPosition}px`;
  body.style.right = "0";
  body.style.left = "0";
  body.style.width = "100%";
};

const unlockBody = (): void => {
  activeLockCount = Math.max(0, activeLockCount - 1);

  if (activeLockCount > 0 || !savedBodyStyles) {
    return;
  }

  const body = document.body;
  body.style.overflow = savedBodyStyles.overflow;
  body.style.position = savedBodyStyles.position;
  body.style.top = savedBodyStyles.top;
  body.style.right = savedBodyStyles.right;
  body.style.left = savedBodyStyles.left;
  body.style.width = savedBodyStyles.width;
  savedBodyStyles = null;
  window.scrollTo({ top: lockedScrollPosition, behavior: "auto" });
};

export const useBodyScrollLock = (isLocked: boolean): void => {
  useEffect(() => {
    if (!isLocked) {
      return undefined;
    }

    lockBody();
    return unlockBody;
  }, [isLocked]);
};
