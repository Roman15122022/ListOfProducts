import {
  History,
  ListChecks,
  Refrigerator,
  Settings,
  Sparkles,
} from "lucide-react";

import type { NavigationItem, ScreenId } from "../types/app";

export const navigationItems: NavigationItem[] = [
  { id: "list", icon: ListChecks, path: "/" },
  { id: "suggestions", icon: Sparkles, path: "/suggestions" },
  { id: "pantry", icon: Refrigerator, path: "/pantry" },
  { id: "history", icon: History, path: "/history" },
  { id: "settings", icon: Settings, path: "/settings" },
];

export const mobileNavigationOrder: ScreenId[] = [
  "suggestions",
  "pantry",
  "list",
  "history",
  "settings",
];

export const getScreenFromPath = (pathname: string): ScreenId => {
  if (pathname === "/templates") {
    return "pantry";
  }

  return navigationItems.find((item) => item.path === pathname)?.id ?? "list";
};
