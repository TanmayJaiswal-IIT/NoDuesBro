import { CaseActions } from "@/components/case-actions";
import type { DeskCase } from "@/lib/desk/query";

export function CaseCard({ item }: { item: DeskCase }) {
  return (
    <article className="border border-[#e4dccb] bg-white px-5 py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-medium text-[#1c1915]">
          {item.label}
          <span className="text-[#6d6458]"> · {item.merchant}</span>
        </h2>
        <p className="text-base font-semibold text-[#1c1915]">{item.amountLabel}</p>
      </div>
      <p className="mt-1 text-sm text-[#6d6458]">{item.deadlineLine}</p>
      <div className="mt-4 border-t border-[#f0eadc] pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">Evidence</p>
        <ul className="mt-2 space-y-1 text-sm text-[#3d3832]">
          {item.evidence.map((message) => (
            <li key={`${message.fromAddress}-${message.subject}`}>
              {message.fromName} · {message.subject}
            </li>
          ))}
        </ul>
        <blockquote className="mt-3 text-sm leading-6 text-[#1c1915]">
          {item.evidenceQuote}
        </blockquote>
      </div>
      {item.draft ? (
        <div className="mt-4 border-t border-[#f0eadc] pt-4 text-sm leading-6 text-[#1c1915]">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">Draft</p>
          <p className="mt-2">To: {item.draft.to}</p>
          <p>Subject: {item.draft.subject}</p>
          <p className="mt-3 whitespace-pre-wrap">{item.draft.body}</p>
        </div>
      ) : null}
      {item.draft ? <CaseActions caseId={item.id} draftId={item.draft.id} /> : null}
    </article>
  );
}
