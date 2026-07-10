import {
  History,
  LayoutTemplate,
  ListChecks,
  Settings,
  Sparkles,
} from "lucide-react";

import type { NavigationItem, ScreenId } from "../types/app";

export const navigationItems: NavigationItem[] = [
  { id: "list", icon: ListChecks, path: "/" },
  { id: "suggestions", icon: Sparkles, path: "/suggestions" },
  { id: "templates", icon: LayoutTemplate, path: "/templates" },
  { id: "history", icon: History, path: "/history" },
  { id: "settings", icon: Settings, path: "/settings" },
];

export const mobileNavigationOrder: ScreenId[] = [
  "suggestions",
  "templates",
  "list",
  "history",
  "settings",
];

export const getScreenFromPath = (pathname: string): ScreenId =>
  navigationItems.find((item) => item.path === pathname)?.id ?? "list";
