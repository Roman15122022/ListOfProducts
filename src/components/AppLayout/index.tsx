import { RefreshCw, Settings, ShoppingBasket, WifiOff } from "lucide-react";

import { useLocalization } from "../../contexts/LocalizationContext/useLocalization";
import { mobileNavigationOrder, navigationItems } from "../../navigation/constants";
import type { ScreenId } from "../../types/app";

export const LoadingState = () => {
  const { copy } = useLocalization();

  return (
    <main className="app-shell">
      <div className="app-frame">
        <section className="app-main">
          <div className="panel empty-state">
            <div className="empty-state-inner">
              <div className="empty-icon">
                <ShoppingBasket size={28} />
              </div>
              <h2>{copy.app.loadingTitle}</h2>
              <p>{copy.app.loadingDescription}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export const ErrorState = ({ onRetry }: { onRetry: () => void }) => {
  const { copy } = useLocalization();

  return (
    <main className="app-shell">
      <div className="app-frame single-panel-frame">
        <section className="app-main">
          <div className="panel empty-state">
            <div className="empty-state-inner">
              <div className="empty-icon error-icon">
                <RefreshCw size={27} />
              </div>
              <h2>{copy.app.errorTitle}</h2>
              <p>{copy.app.errorDescription}</p>
              <button className="button button-primary" type="button" onClick={onRetry}>
                <RefreshCw size={17} />
                {copy.app.retry}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export const Brand = () => {
  const { copy } = useLocalization();

  return (
    <div className="brand-mark">
      <div className="brand-icon">
        <ShoppingBasket size={21} strokeWidth={2.3} />
      </div>
      <div className="brand-copy">
        <span>{copy.app.brandTagline}</span>
        <strong>{copy.app.brandName}</strong>
      </div>
    </div>
  );
};

export const DesktopNavigation = ({
  activeScreen,
  onSelect,
}: {
  activeScreen: ScreenId;
  onSelect: (screenId: ScreenId) => void;
}) => {
  const { copy } = useLocalization();

  return (
    <aside className="desktop-nav panel">
      <Brand />
      <nav className="desktop-nav-items" aria-label={copy.app.primaryNavigation}>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeScreen === item.id ? "active" : ""}`}
              type="button"
              onClick={() => onSelect(item.id)}
            >
              <Icon size={19} />
              <span>{copy.navigation[item.id]}</span>
            </button>
          );
        })}
      </nav>
      <p className="desktop-nav-bottom">{copy.app.localData}</p>
    </aside>
  );
};

export const BottomNavigation = ({
  activeScreen,
  onSelect,
}: {
  activeScreen: ScreenId;
  onSelect: (screenId: ScreenId) => void;
}) => {
  const { copy } = useLocalization();

  return (
    <nav className="bottom-nav" aria-label={copy.app.primaryNavigation}>
      {mobileNavigationOrder.map((screenId) => {
        const item = navigationItems.find((navigationItem) => navigationItem.id === screenId);

        if (!item) {
          return null;
        }

        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={`nav-item ${activeScreen === item.id ? "active" : ""}`}
            type="button"
            onClick={() => onSelect(item.id)}
          >
            <Icon aria-hidden="true" />
            <span>{copy.navigation[item.id]}</span>
          </button>
        );
      })}
    </nav>
  );
};

export const TopBar = ({
  activeScreen,
  isOnline,
  onOpenShoppingMode,
  onOpenSettings,
}: {
  activeScreen: ScreenId;
  isOnline: boolean;
  onOpenShoppingMode: () => void;
  onOpenSettings: () => void;
}) => {
  const { copy } = useLocalization();

  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        {!isOnline && (
          <span className="offline-dot" title={copy.common.offline} aria-label={copy.common.offline}>
            <WifiOff size={0} />
          </span>
        )}
        {activeScreen === "list" && (
          <button
            className="icon-button"
            type="button"
            aria-label={copy.app.openShoppingMode}
            title={copy.app.shoppingMode}
            onClick={onOpenShoppingMode}
          >
            <ShoppingBasket size={20} />
          </button>
        )}
        {activeScreen !== "settings" && (
          <button
            className="icon-button"
            type="button"
            aria-label={copy.app.openSettings}
            title={copy.settings.title}
            onClick={onOpenSettings}
          >
            <Settings size={20} />
          </button>
        )}
      </div>
    </header>
  );
};
