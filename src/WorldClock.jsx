import { useEffect, useState } from "react";

const CITIES = [
  { name: "Johannesburg", zone: "Africa/Johannesburg" },
  { name: "London", zone: "Europe/London" },
  { name: "New York", zone: "America/New_York" },
  { name: "Tokyo", zone: "Asia/Tokyo" },
];

export default function WorldClock() {
  const [now, setNow] = useState(() => new Date());
  const [use24Hour, setUse24Hour] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section
      aria-label="World clocks"
      className="mx-5 mt-3 rounded-2xl border border-[#232019] bg-[#161514] p-3"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#C9A44C]">
          World clock
        </h2>
        <button
          type="button"
          onClick={() => setUse24Hour(value => !value)}
          aria-pressed={use24Hour}
          className="rounded-full border border-[#C9A44C]/40 px-2 py-1 text-[10px] text-[#D8D2C4] hover:text-[#C9A44C]"
        >
          {use24Hour ? "24-hour" : "12-hour"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CITIES.map(({ name, zone }) => (
          <article key={zone} className="min-w-0">
            <h3 className="truncate text-[11px] text-[#8A8580]">{name}</h3>
            <time
              className="block whitespace-nowrap font-mono text-lg tabular-nums text-[#F5F1E8]"
              dateTime={now.toISOString()}
            >
              {new Intl.DateTimeFormat(undefined, {
                timeZone: zone,
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                hour12: !use24Hour,
              }).format(now)}
            </time>
            <p className="truncate text-[10px] text-[#8A8580]">
              {new Intl.DateTimeFormat(undefined, {
                timeZone: zone,
                weekday: "short",
                month: "short",
                day: "numeric",
              }).format(now)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
