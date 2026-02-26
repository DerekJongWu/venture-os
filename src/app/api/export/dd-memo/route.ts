// POST /api/export/dd-memo — generate a PDF from DD memo content
// Body: { dealId, memoContent }
// Returns: application/pdf binary

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/ai/client";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 56,
    color: "#1a1a1a",
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 16,
  },
  fundName: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  companyName: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 4,
  },
  subheader: {
    fontSize: 9,
    color: "#9ca3af",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
    marginBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.55,
    color: "#374151",
    marginBottom: 4,
  },
  bullet: {
    fontSize: 10,
    lineHeight: 1.55,
    color: "#374151",
    marginLeft: 12,
    marginBottom: 2,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 8,
    color: "#9ca3af",
  },
});

// ─── Parse memo into sections ─────────────────────────────────────────────────

interface MemoSection {
  title: string;
  lines: string[];
}

function parseMemo(text: string): MemoSection[] {
  const sections: MemoSection[] = [];
  let currentSection: MemoSection | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();

    // Heading lines: "## Title" or "**Title**" or "1. Title"
    const headingMatch =
      line.match(/^#{1,3}\s+(.+)/) ??
      line.match(/^\*\*(.+)\*\*\s*$/) ??
      line.match(/^\d+\.\s+\*\*(.+?)\*\*/);

    if (headingMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: headingMatch[1].replace(/\*\*/g, ""), lines: [] };
      continue;
    }

    if (currentSection) {
      const stripped = line.replace(/\*\*/g, "").replace(/^[-•]\s*/, "");
      if (stripped.trim()) currentSection.lines.push(line);
    } else if (line.trim()) {
      // Pre-heading content — create an intro section
      currentSection = { title: "", lines: [line] };
    }
  }
  if (currentSection) sections.push(currentSection);
  return sections;
}

// ─── PDF Document component ───────────────────────────────────────────────────

function MemoDocument({
  fundName,
  companyName,
  date,
  sections,
  pageCount,
}: {
  fundName: string;
  companyName: string;
  date: string;
  sections: MemoSection[];
  pageCount: number;
}) {
  return React.createElement(
    Document,
    { title: `DD Memo — ${companyName}` },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      // Header
      React.createElement(
        View,
        { style: styles.header },
        fundName
          ? React.createElement(Text, { style: styles.fundName }, fundName)
          : null,
        React.createElement(Text, { style: styles.companyName }, companyName),
        React.createElement(
          Text,
          { style: styles.subheader },
          `Due Diligence Memo  ·  Generated ${date}`
        )
      ),
      // Sections
      ...sections.map((s, i) =>
        React.createElement(
          View,
          { key: i, style: styles.section },
          s.title
            ? React.createElement(Text, { style: styles.sectionTitle }, s.title)
            : null,
          ...s.lines.map((line, j) => {
            const isBullet = /^[-•*]\s/.test(line.trim());
            const clean = line.replace(/\*\*/g, "").replace(/^[-•*]\s*/, "").trim();
            return React.createElement(
              Text,
              { key: j, style: isBullet ? styles.bullet : styles.paragraph },
              isBullet ? `• ${clean}` : clean
            );
          })
        )
      ),
      // Footer with page numbers
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(
          Text,
          { style: styles.footerText },
          fundName ? fundName : "Confidential"
        ),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
              `${pageNumber} / ${totalPages}`,
          }
        )
      )
    )
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    dealId?: string;
    memoContent?: string;
  };

  const { dealId, memoContent } = body;
  if (!dealId || !memoContent?.trim()) {
    return NextResponse.json(
      { error: "dealId and memoContent required" },
      { status: 400 }
    );
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const fundName = (await getSetting("fund_name")) ?? "";
  const date = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const sections = parseMemo(memoContent);

  const doc = React.createElement(MemoDocument, {
    fundName,
    companyName: deal.company_name,
    date,
    sections,
    pageCount: 0, // handled by react-pdf internally
  });

  const pdfBuffer = await renderToBuffer(doc as React.ReactElement);

  const filename = `DD Memo — ${deal.company_name} — ${date}.pdf`;
  const encoded = encodeURIComponent(filename);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Content-Length": String(pdfBuffer.length),
    },
  });
}
