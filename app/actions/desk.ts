"use server";

import { revalidatePath } from "next/cache";
import {
  approveCase,
  dismissCase as dismissReadyCase,
  resetDemoDesk,
  snoozeCase as snoozeReadyCase,
  updateStandingOrders as saveStandingOrders,
} from "@/lib/desk/commands";

export async function approveAndSend(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const result = await approveCase(
    String(formData.get("caseId") ?? ""),
    String(formData.get("draftId") ?? ""),
  );
  if (!result.ok) return { error: result.reason };
  revalidatePath("/demo");
  return { error: null };
}

export async function dismissCase(formData: FormData) {
  await dismissReadyCase(String(formData.get("caseId") ?? ""));
  revalidatePath("/demo");
}

export async function snoozeCase(formData: FormData) {
  await snoozeReadyCase(String(formData.get("caseId") ?? ""));
  revalidatePath("/demo");
}

export async function updateStandingOrders(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const askBeforeSend = formData.get("askBeforeSend");
  const result = await saveStandingOrders({
    askBeforeSend: askBeforeSend === null ? undefined : askBeforeSend === "true",
    returnHorizonDays: Number(formData.get("returnHorizonDays")),
    renewalHorizonDays: Number(formData.get("renewalHorizonDays")),
    duplicateWindowHours: Number(formData.get("duplicateWindowHours")),
    ignoreUnderRupees: Number(formData.get("ignoreUnderRupees")),
  });
  if (!result.ok) return { error: result.reason };
  revalidatePath("/demo");
  return { error: null };
}

export async function resetDemo() {
  await resetDemoDesk();
  revalidatePath("/demo");
}
