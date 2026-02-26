import { NextRequest, NextResponse } from "next/server";
import {
  anthropic,
  AI_MODEL,
  getSystemPrompt,
  streamResponse,
} from "@/lib/ai/client";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { dealId, question } = body as { dealId?: string; question?: string };

  if (!dealId || !question?.trim()) {
    return NextResponse.json({ error: "dealId and question required" }, { status: 400 });
  }

  const files = await prisma.dataRoomFile.findMany({
    where: { deal_id: dealId, NOT: { extracted_text: null } },
    orderBy: { uploaded_at: "asc" },
  });

  if (files.length === 0) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            "No documents with extracted text are available for this deal. Upload PDF or DOCX files to enable data room Q&A."
          )
        );
        controller.close();
      },
    });
    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const docsContext = files
    .map((f) => `[File: ${f.file_name}]\n${f.extracted_text}`)
    .join("\n\n---\n\n");

  const systemPrompt = await getSystemPrompt();

  const userPrompt = `You are answering a question about documents uploaded to a deal's data room. Answer based solely on the provided documents. When referencing specific information, cite the source file name in brackets (e.g. "[pitch_deck.pdf]"). If the answer is not found in the documents, say so clearly.

## Question
${question}

## Data Room Documents
${docsContext}`;

  const stream = anthropic.messages.stream({
    model: AI_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return streamResponse(stream);
}
