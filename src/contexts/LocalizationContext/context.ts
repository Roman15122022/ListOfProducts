import { createContext } from "react";

import { getAppCopy } from "../../lib/localization";
import type { LocalizationContextValue } from "../../types/app";

export const LocalizationContext = createContext<LocalizationContextValue>({
  copy: getAppCopy("en"),
  language: "en",
});
