import { dismissCase } from "@/app/actions/desk";
import type { DeskRefused } from "@/lib/desk/query";

export function RefusedCard({ item }: { item: DeskRefused }) {
  return (
    <article className="border border-[#e4dccb] bg-white px-5 py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-medium text-[#1c1915]">Refused · {item.senderName}</h3>
        <p className="text-base font-semibold text-[#1c1915]">{item.amountLabel}</p>
      </div>
      <p className="mt-1 text-sm text-[#6d6458]">{item.fromAddress}</p>
      <p className="mt-3 text-sm leading-6 text-[#1c1915]">{item.reason}</p>
      <form action={dismissCase} className="mt-4 border-t border-[#f0eadc] pt-4">
        <input type="hidden" name="caseId" value={item.id} />
        <button
          type="submit"
          className="border border-[#e4dccb] bg-white px-3 py-2 text-sm text-[#1c1915]"
        >
          Dismiss
        </button>
      </form>
    </article>
  );
}
