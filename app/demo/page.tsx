import { Suspense } from "react";
import { connection } from "next/server";
import { DeskShell } from "@/components/desk-shell";
import { getDesk } from "@/lib/desk/query";

export default function DemoPage() {
  return (
    <Suspense fallback={<DeskOpening />}>
      <LiveDesk />
    </Suspense>
  );
}

async function LiveDesk() {
  await connection();
  const desk = await getDesk();
  return <DeskShell desk={desk} showReset />;
}

function DeskOpening() {
  return (
    <main className="mx-auto min-h-full w-full max-w-5xl bg-[#f7f3ea] text-[#1c1915]">
      <header className="px-6 py-5 sm:px-10">
        <p className="text-sm font-semibold tracking-tight">NoDuesBro</p>
      </header>
      <p className="px-6 text-sm text-[#6d6458] sm:px-10">Opening the desk</p>
    </main>
  );
}
