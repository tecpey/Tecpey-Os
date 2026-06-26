"use client";

type Props = {
  tabs: string[];
  active: string;
  setActive: (tab: string) => void;
};

export default function MarketTabs({ tabs, active, setActive }: Props) {
  const handleTabClick = (tab: string) => {
    setActive(tab);

    const section = document.getElementById(tab);

    if (section) {
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <div className="border-b border-gray-300 mb-6">
      <ul className="flex gap-4 sm:gap-8 text-sm font-medium text-muted overflow-x-auto whitespace-nowrap pb-3 -mb-3 no-scrollbar">
        {tabs.map((tab) => (
          <li
            key={tab}
            onClick={() => handleTabClick(tab)}
            className={`pb-3 cursor-pointer transition
              ${
                active === tab
                  ? "border-b-2 border-fg text-fg"
                  : "text-gray-500 hover:text-gray-700"
              }`}
          >
            {tab}
          </li>
        ))}
      </ul>
    </div>
  );
}