import { useEffect, useState } from "react";

export const useIsMobileViewport = (): boolean => {
  const [isMobileViewport, setMobileViewport] = useState(() =>
    window.matchMedia("(max-width: 719px)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 719px)");
    const updateViewport = () => setMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  return isMobileViewport;
};
