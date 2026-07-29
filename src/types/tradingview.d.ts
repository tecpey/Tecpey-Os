type TradingViewOverrides = Record<string, string | number | boolean>;

interface TradingViewWidgetInstance {
  onChartReady(callback: () => void): void;
  changeTheme(theme: "Dark" | "Light"): void;
  applyOverrides(overrides: TradingViewOverrides): void;
  remove(): void;
}

interface TradingViewWidgetConstructor {
  new (options: Record<string, unknown>): TradingViewWidgetInstance;
}

interface TradingViewGlobal {
  widget: TradingViewWidgetConstructor;
}

interface TradingViewDatafeedConstructor {
  new (url: string): unknown;
}

interface TradingViewDatafeedsGlobal {
  UDFCompatibleDatafeed: TradingViewDatafeedConstructor;
}

interface Window {
  TradingView?: TradingViewGlobal;
  Datafeeds?: TradingViewDatafeedsGlobal;
}
