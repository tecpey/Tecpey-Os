"use client";

export type MarketTabId =
  | "market-chart"
  | "market-data"
  | "price-information"
  | "about-coin"
  | "other-coins";

export type MarketTab = {
  id: MarketTabId;
  label: string;
};

type Props = {
  tabs: readonly MarketTab[];
  active: MarketTabId;
  onSelect: (tab: MarketTabId) => void;
};

export default function MarketTabs({ tabs, active, onSelect }: Props) {
  return (
    <nav aria-label="Market sections" className="border-b border-gray-300 mb-6">
      <ul className="flex gap-4 sm:gap-8 text-sm font-medium text-muted overflow-x-auto whitespace-nowrap pb-3 -mb-3 no-scrollbar">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={active === tab.id ? "true" : undefined}
              className={`pb-3 cursor-pointer transition ${
                active === tab.id
                  ? "border-b-2 border-fg text-fg"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
