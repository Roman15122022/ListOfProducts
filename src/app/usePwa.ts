import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

import type {
  AppInstallState,
  BeforeInstallPromptEvent,
} from "../types/app";

type InstallPromptResult = "accepted" | "dismissed" | "unavailable";

const getInstalledState = (): boolean => {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  );
};

const isIosDevice = (): boolean =>
  /iPad|iPhone|iPod/u.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const usePwa = () => {
  const [isOnline, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isAppInstalled, setAppInstalled] = useState(getInstalledState);
  const [isUpdateAvailable, setUpdateAvailable] = useState(false);
  const [isOfflineReady, setOfflineReady] = useState(false);
  const [serviceWorkerError, setServiceWorkerError] = useState<string | null>(null);
  const updateServiceWorkerReference = useRef<
    ((reloadPage?: boolean) => Promise<void>) | null
  >(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => {
      const nextInstalledState = getInstalledState();
      setAppInstalled(nextInstalledState);

      if (nextInstalledState) {
        setInstallPrompt(null);
      }
    };

    window.addEventListener("appinstalled", updateInstalledState);
    displayModeQuery.addEventListener("change", updateInstalledState);

    return () => {
      window.removeEventListener("appinstalled", updateInstalledState);
      displayModeQuery.removeEventListener("change", updateInstalledState);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    updateServiceWorkerReference.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setUpdateAvailable(true),
      onOfflineReady: () => setOfflineReady(true),
      onRegisterError: (error) => {
        setServiceWorkerError(
          error instanceof Error ? error.message : "Service worker registration failed.",
        );
      },
    });
  }, []);

  const installApp = async (): Promise<InstallPromptResult> => {
    if (!installPrompt) {
      return "unavailable";
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    return choice.outcome;
  };

  const updateApp = async (): Promise<boolean> => {
    const updateServiceWorker = updateServiceWorkerReference.current;

    if (!updateServiceWorker) {
      setServiceWorkerError("Service worker update is unavailable.");
      return false;
    }

    try {
      await updateServiceWorker(true);
      return true;
    } catch (error) {
      setServiceWorkerError(
        error instanceof Error ? error.message : "Service worker update failed.",
      );
      return false;
    }
  };

  const installState: AppInstallState = isAppInstalled
    ? "installed"
    : installPrompt
      ? "available"
      : isIosDevice()
        ? "ios"
        : "unavailable";

  return {
    isOnline,
    installState,
    isUpdateAvailable,
    isOfflineReady,
    serviceWorkerError,
    installApp,
    updateApp,
    clearOfflineReady: () => setOfflineReady(false),
    clearServiceWorkerError: () => setServiceWorkerError(null),
  };
};
