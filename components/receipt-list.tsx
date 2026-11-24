import { StandingOrders } from "@/components/standing-orders";
import type { DeskOrders, DeskReceipt } from "@/lib/desk/query";

export function ReceiptList({
  receipts,
  orders,
}: {
  receipts: DeskReceipt[];
  orders: DeskOrders;
}) {
  return (
    <aside className="border-t border-[#e4dccb] px-6 py-6 min-[800px]:border-t-0 min-[800px]:border-l">
      <h2 className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">Receipts</h2>
      <ul className="mt-4 space-y-5">
        {receipts.map((receipt) => (
          <li key={receipt.id}>
            <p className="text-sm text-[#6d6458]">{receipt.sentLabel}</p>
            <p className="mt-1 text-sm font-medium text-[#1c1915]">
              {receipt.amountLabel} sent · {receipt.merchant}
            </p>
            <p className="mt-1 text-sm text-[#3d3832]">&ldquo;{receipt.subject}&rdquo;</p>
            <p className="mt-2 text-sm text-[#6d6458]">
              Sent from your inbox. NoDuesBro cannot pull this back.
            </p>
            <details className="mt-2 text-sm leading-6 text-[#1c1915]">
              <summary className="cursor-pointer text-[#6d6458]">Open receipt</summary>
              <p className="mt-2">To: {receipt.to}</p>
              <p>Subject: {receipt.subject}</p>
              <p className="mt-2 whitespace-pre-wrap">{receipt.body}</p>
              <p className="mt-2 text-[#6d6458]">Sent {receipt.sentClock}</p>
              {receipt.approvalClock ? (
                <p className="text-[#6d6458]">Approved {receipt.approvalClock}</p>
              ) : null}
            </details>
          </li>
        ))}
      </ul>
      <StandingOrders
        key={`${orders.returnHorizonDays}-${orders.renewalHorizonDays}-${orders.duplicateWindowHours}-${orders.ignoreUnderRupees}`}
        orders={orders}
      />
    </aside>
  );
}
