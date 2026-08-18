import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Finding = {
  passed: boolean | null;
  evidence: string;
};

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
]);

function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
  }
  return false;
}

function normalizeUrl(input: string): URL | null {
  let v = input.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!u.hostname.includes(".") || isPrivateOrReservedHost(u.hostname)) return null;
  return u;
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const target = normalizeUrl(body.url ?? "");
  if (!target) {
    return NextResponse.json(
      { error: "Enter a valid website address, like yourbusiness.com." },
      { status: 400 },
    );
  }

  let html = "";
  let fetchMs = 0;
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LeadGapScanBot/1.0)",
      },
    });
    clearTimeout(timeout);
    fetchMs = Date.now() - start;

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `That site responded with an error (HTTP ${res.status}). Double-check the address, or continue and answer the checks manually.`,
        },
        { status: 502 },
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      {
        error:
          "Couldn't reach that website automatically — it may be blocking automated requests, or the address may be wrong. You can still continue and answer manually.",
      },
      { status: 502 },
    );
  }

  const sample = html.slice(0, 800_000);

  const findings: Record<string, Finding> = {};

  const hasTelLink = /href=["']tel:/i.test(sample);
  findings.mobileCall = {
    passed: hasTelLink,
    evidence: hasTelLink ? "Found a clickable phone (tel:) link." : "No clickable phone link found in the page.",
  };

  const formMatch = sample.match(/<form[\s\S]*?<\/form>/i);
  let shortForm: boolean | null = null;
  let fieldCount: number | null = null;
  if (formMatch) {
    const fields = formMatch[0].match(
      /<input\b(?![^>]*type=["'](hidden|submit|button)["'])[^>]*>|<textarea\b[^>]*>|<select\b[^>]*>/gi,
    );
    fieldCount = fields ? fields.length : 0;
    shortForm = fieldCount > 0 && fieldCount <= 5;
  }
  findings.shortForm = {
    passed: shortForm,
    evidence: formMatch
      ? `Found a form with ${fieldCount} field(s).`
      : "No <form> tag found in the page HTML (it may load in dynamically — worth checking manually).",
  };

  const hasResponseClaim =
    /(respond|reply|get back to you|call you back)[^.]{0,40}(within|in)\s+\d+\s*(minute|hour|business day|day)/i.test(
      sample,
    );
  findings.responseTime = {
    passed: hasResponseClaim ? true : null,
    evidence: hasResponseClaim
      ? "Found language describing a response time."
      : "No response-time language detected — easy to miss automatically, please confirm.",
  };

  findings.servicePages = {
    passed: null,
    evidence: "Best judged by eye — automated scans can't reliably tell whether service pages are actually useful.",
  };

  const hasAddressSchema = /"@type"\s*:\s*"PostalAddress"/i.test(sample);
  const hasServiceAreaWord = /service area|proudly serv(?:es|ing)|areas we serve/i.test(sample);
  findings.location = {
    passed: hasAddressSchema || hasServiceAreaWord,
    evidence: hasAddressSchema
      ? "Found structured address data."
      : hasServiceAreaWord
        ? "Found service-area language."
        : "No clear location signals found.",
  };

  const hasReviewSchema = /"@type"\s*:\s*"(Review|AggregateRating)"/i.test(sample);
  const hasReviewWord = /testimonial|verified review|google reviews|read our reviews/i.test(sample);
  findings.trust = {
    passed: hasReviewSchema || hasReviewWord,
    evidence: hasReviewSchema
      ? "Found review/rating structured data."
      : hasReviewWord
        ? "Found review or testimonial language."
        : "No review or trust signals found.",
  };

  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(sample);
  findings.mobile = {
    passed: hasViewport ? null : false,
    evidence: hasViewport
      ? "Has a mobile viewport tag, but actual usability still needs a manual check on your phone."
      : "No mobile viewport tag found — the site is likely not optimized for phones.",
  };

  findings.speed = {
    passed: fetchMs > 0 ? fetchMs < 1500 : null,
    evidence: fetchMs > 0
      ? `Initial page responded in ${fetchMs}ms (a rough proxy — not a full speed test).`
      : "Could not measure response time.",
  };

  const hasWidget = /intercom|drift\.com|tawk\.to|calendly|acuityscheduling|livechatinc/i.test(sample);
  findings.afterHours = {
    passed: hasWidget ? true : null,
    evidence: hasWidget
      ? "Found a chat or scheduling widget."
      : "No chat/scheduling widget detected — please confirm manually.",
  };

  const hasTracking =
    /googletagmanager\.com|gtag\(|google-analytics\.com|callrail|whatconverts|calltrackingmetrics/i.test(sample);
  findings.tracking = {
    passed: hasTracking,
    evidence: hasTracking ? "Found analytics or call-tracking scripts." : "No common tracking scripts detected.",
  };

  return NextResponse.json({ findings, fetchMs, scannedUrl: target.toString() });
}
