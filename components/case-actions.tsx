"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { approveAndSend, dismissCase, snoozeCase } from "@/app/actions/desk";

type ApproveState = { error: string | null };

const initialApproveState: ApproveState = { error: null };

function SubmitButton({ children, className }: { children: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {children}
    </button>
  );
}

export function CaseActions({ caseId, draftId }: { caseId: string; draftId: string }) {
  const [approveState, approveAction] = useActionState(approveAndSend, initialApproveState);

  return (
    <div className="mt-4 border-t border-[#f0eadc] pt-4">
      {approveState.error ? (
        <p className="mb-3 text-sm text-[#8a3a2a]">{approveState.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={approveAction}>
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="draftId" value={draftId} />
          <SubmitButton className="border border-[#1c1915] bg-[#1c1915] px-3 py-2 text-sm text-[#f7f3ea] disabled:opacity-60">
            Approve and send
          </SubmitButton>
        </form>
        <form action={dismissCase}>
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton className="border border-[#e4dccb] bg-white px-3 py-2 text-sm text-[#1c1915] disabled:opacity-60">
            Dismiss
          </SubmitButton>
        </form>
        <form action={snoozeCase}>
          <input type="hidden" name="caseId" value={caseId} />
          <SubmitButton className="border border-[#e4dccb] bg-white px-3 py-2 text-sm text-[#1c1915] disabled:opacity-60">
            Snooze
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
