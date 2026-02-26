import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// POST /api/dataroom/upload — multipart form: { dealId, file }
export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const dealId = formData.get("dealId") as string | null;
  const file = formData.get("file") as File | null;

  if (!dealId || !file) {
    return NextResponse.json({ error: "dealId and file required" }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Determine file type from extension
  const ext = path.extname(file.name).toLowerCase();
  const fileType =
    ext === ".pdf" ? "pdf"
    : ext === ".docx" || ext === ".doc" ? "docx"
    : ext === ".xlsx" || ext === ".xls" ? "xlsx"
    : "other";

  // Save file to /data/dataroom/{dealId}/{filename}
  const dir = path.join(process.cwd(), "data", "dataroom", dealId);
  await mkdir(dir, { recursive: true });

  const fileName = file.name;
  const relPath = `/data/dataroom/${dealId}/${fileName}`;
  const fullPath = path.join(dir, fileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  // Extract text based on file type
  let extractedText: string | null = null;

  if (fileType === "pdf") {
    try {
      // Dynamic require avoids pdf-parse's test-file side effect at module load
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(buffer);
      extractedText = result.text?.trim() || null;
    } catch {
      extractedText = null;
    }
  } else if (fileType === "docx") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value?.trim() || null;
    } catch {
      extractedText = null;
    }
  }
  // xlsx and other: extracted_text remains null

  const record = await prisma.dataRoomFile.create({
    data: {
      deal_id: dealId,
      file_name: fileName,
      file_path: relPath,
      file_type: fileType,
      extracted_text: extractedText,
      file_size: buffer.length,
    },
  });

  return NextResponse.json(record);
}
