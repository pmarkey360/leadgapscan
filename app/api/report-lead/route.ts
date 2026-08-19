import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    website?: string;
    industry?: string;
    score?: number;
    gap?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  // No database or email service is connected yet. For now, submissions are
  // logged here so they're visible in Netlify's Functions logs — go to your
  // Netlify dashboard > your site > Logs > Functions > report-lead to see
  // every submission come in.
  //
  // When you're ready for a real inbox/CRM, replace this console.log with
  // either:
  //   1. A Netlify Forms submission (no code needed, has its own dashboard), or
  //   2. A call to an email service (Resend, Postmark, SendGrid, etc.) using
  //      an API key stored in Netlify's environment variables — never commit
  //      that key into this file.
  console.log("[report-lead] New submission:", {
    email,
    website: body.website ?? null,
    industry: body.industry ?? null,
    score: body.score ?? null,
    gap: body.gap ?? null,
    receivedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
