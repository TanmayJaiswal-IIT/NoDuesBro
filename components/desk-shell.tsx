import { resetDemo } from "@/app/actions/desk";
import { CaseCard } from "@/components/case-card";
import { HeroTotal } from "@/components/hero-total";
import { ReceiptList } from "@/components/receipt-list";
import { RefusedCard } from "@/components/refused-card";
import type { Desk } from "@/lib/desk/query";

export function DeskShell({ desk, showReset = false }: { desk: Desk; showReset?: boolean }) {
  return (
    <main className="mx-auto min-h-full w-full max-w-5xl bg-[#f7f3ea] text-[#1c1915]">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-4">
          <p className="text-sm font-semibold tracking-tight">Found</p>
          {showReset ? (
            <form action={resetDemo}>
              <button type="submit" className="text-sm text-[#6d6458] underline">
                Reset demo
              </button>
            </form>
          ) : null}
        </div>
        <p className="text-sm text-[#6d6458]">{desk.clockLabel}</p>
        <p className="text-sm text-[#1c1915]">{desk.displayName}</p>
      </header>
      <HeroTotal desk={desk} />
      <div className="grid min-[800px]:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <section className="space-y-4 px-6 py-6 sm:px-10">
            <h2 className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">
              Waiting on you
            </h2>
            {desk.cases.length === 0 ? (
              <p className="text-sm text-[#6d6458]">Nothing waiting this morning.</p>
            ) : (
              desk.cases.map((item) => <CaseCard key={item.id} item={item} />)
            )}
          </section>
          {desk.refused.length > 0 ? (
            <section className="space-y-4 px-6 pb-6 sm:px-10">
              <h2 className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">Held back</h2>
              {desk.refused.map((item) => (
                <RefusedCard key={item.id} item={item} />
              ))}
            </section>
          ) : null}
        </div>
        <ReceiptList receipts={desk.receipts} orders={desk.orders} />
      </div>
    </main>
  );
}
