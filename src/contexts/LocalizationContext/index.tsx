import type { ReactNode } from "react";

import type { LocalizationContextValue } from "../../types/app";
import { LocalizationContext } from "./context";

type LocalizationProviderProps = LocalizationContextValue & {
  children: ReactNode;
};

export const LocalizationProvider = ({
  children,
  copy,
  language,
}: LocalizationProviderProps) => (
  <LocalizationContext.Provider value={{ copy, language }}>
    {children}
  </LocalizationContext.Provider>
);
