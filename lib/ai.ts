import { openai } from "@ai-sdk/openai";

export const extractionModel = openai(process.env.OPENAI_MODEL ?? "gpt-6.2-sol");
