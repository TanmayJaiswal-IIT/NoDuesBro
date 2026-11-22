import type { DeskReceipt } from "@/lib/desk/query";

export function ReceiptList({ receipts }: { receipts: DeskReceipt[] }) {
  return (
    <aside className="border-t border-[#e4dccb] px-6 py-6 min-[800px]:border-t-0 min-[800px]:border-l">
      <h2 className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">Receipts</h2>
      <ul className="mt-4 space-y-4">
        {receipts.map((receipt) => (
          <li key={receipt.id}>
            <p className="text-sm text-[#6d6458]">{receipt.sentLabel}</p>
            <p className="mt-1 text-sm font-medium text-[#1c1915]">
              {receipt.amountLabel} sent · {receipt.merchant}
            </p>
            <p className="mt-1 text-sm text-[#3d3832]">&ldquo;{receipt.subject}&rdquo;</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
