"use client";

import { useActionState, type ChangeEvent } from "react";
import { updateStandingOrders } from "@/app/actions/desk";
import type { DeskOrders } from "@/lib/desk/query";

type OrdersState = { error: string | null };

const initialState: OrdersState = { error: null };

function saveOnChange(event: ChangeEvent<HTMLInputElement>) {
  event.currentTarget.form?.requestSubmit();
}

export function StandingOrders({ orders }: { orders: DeskOrders }) {
  const [state, action] = useActionState(updateStandingOrders, initialState);

  return (
    <form action={action} className="mt-8 border-t border-[#e4dccb] pt-6">
      <h2 className="text-xs font-medium uppercase tracking-wide text-[#8a8072]">Standing orders</h2>
      <div className="mt-4 flex items-baseline justify-between gap-4 text-sm">
        <p className="text-[#1c1915]">Ask before every send</p>
        <p className="text-[#6d6458]">On, locked</p>
      </div>
      {state.error ? <p className="mt-3 text-sm text-[#8a3a2a]">{state.error}</p> : null}
      <div className="mt-4 space-y-4 text-sm text-[#1c1915]">
        <label className="block">
          Flag return windows closing within
          <span className="mt-1 flex items-center gap-2">
            <input
              name="returnHorizonDays"
              type="number"
              min={1}
              step={1}
              defaultValue={orders.returnHorizonDays}
              onChange={saveOnChange}
              className="w-20 border border-[#e4dccb] bg-white px-2 py-1"
            />
            days
          </span>
        </label>
        <label className="block">
          Flag renewals charging within
          <span className="mt-1 flex items-center gap-2">
            <input
              name="renewalHorizonDays"
              type="number"
              min={1}
              step={1}
              defaultValue={orders.renewalHorizonDays}
              onChange={saveOnChange}
              className="w-20 border border-[#e4dccb] bg-white px-2 py-1"
            />
            days
          </span>
        </label>
        <label className="block">
          Treat the same merchant and amount as a duplicate within
          <span className="mt-1 flex items-center gap-2">
            <input
              name="duplicateWindowHours"
              type="number"
              min={1}
              step={1}
              defaultValue={orders.duplicateWindowHours}
              onChange={saveOnChange}
              className="w-20 border border-[#e4dccb] bg-white px-2 py-1"
            />
            hours
          </span>
        </label>
        <label className="block">
          Ignore renewals under
          <span className="mt-1 flex items-center gap-2">
            <span>₹</span>
            <input
              name="ignoreUnderRupees"
              type="number"
              min={0}
              step={1}
              defaultValue={orders.ignoreUnderRupees}
              onChange={saveOnChange}
              className="w-20 border border-[#e4dccb] bg-white px-2 py-1"
            />
          </span>
        </label>
      </div>
    </form>
  );
}
