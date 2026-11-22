import { connection } from "next/server";
import { DeskShell } from "@/components/desk-shell";
import { getDesk } from "@/lib/desk/query";

export default async function DemoPage() {
  await connection();
  const desk = await getDesk();
  return <DeskShell desk={desk} />;
}
