import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorState } from "../components/AppLayout";
import { LocalizationProvider } from "../contexts/LocalizationContext";
import { getAppCopy } from "../lib/localization";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <LocalizationProvider copy={getAppCopy("en")} language="en">
          <ErrorState onRetry={() => window.location.reload()} />
        </LocalizationProvider>
      );
    }

    return this.props.children;
  }
}
