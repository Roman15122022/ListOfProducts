import { useContext } from "react";

import type { LocalizationContextValue } from "../../types/app";
import { LocalizationContext } from "./context";

export const useLocalization = (): LocalizationContextValue =>
  useContext(LocalizationContext);
