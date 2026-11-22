import type { Desk } from "@/lib/desk/query";

export function HeroTotal({ desk }: { desk: Desk }) {
  return (
    <section className="border-b border-[#e4dccb] px-6 py-8 sm:px-10">
      <h1 className="text-5xl font-semibold tracking-tight text-[#1c1915] sm:text-6xl">
        {desk.heroLabel}
      </h1>
      <p className="mt-3 text-sm text-[#6d6458]">{desk.subtitle}</p>
    </section>
  );
}
