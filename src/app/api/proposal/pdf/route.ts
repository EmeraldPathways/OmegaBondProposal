import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { auth, ADMIN_EMAIL, isLoginConfigured } from "@/auth";
import OmegaProposalPDF from "@/lib/pdf/omega-proposal";
import { buildProposalReport } from "@/lib/pdf/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const price = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().finite().positive().max(1e9),
});
const fund = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(160),
  provider: z.string().min(1).max(160),
  code: z.string().max(100),
  category: z.string().max(100),
  currency: z.literal("EUR"),
  risk: z.number().int().min(1).max(7).nullable(),
  fee: z.number().finite().min(0).max(15).nullable(),
  prices: z.array(price).min(2).max(350),
  source: z.enum(["synthetic","session"]),
  factsheetDate: z.string().max(30).optional(),
  factsheetName: z.string().max(180).optional(),
});
const portfolio = z.object({
  id: z.string().min(1).max(30),
  title: z.string().min(1).max(80),
  description: z.string().max(250),
  weights: z.record(z.number().finite().min(0).max(100)),
});
const payload = z.object({
  client: z.string().max(120).default(""),
  adviser: z.string().max(120).default(""),
  objective: z.string().min(1).max(600),
  investment: z.number().finite().positive().max(1e9),
  chartWindow: z.union([z.literal(3),z.literal(5),z.literal(10)]),
  funds: z.array(fund).min(1).max(18),
  portfolios: z.array(portfolio).min(2).max(3),
});

const noCache = { "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" };

export async function POST(request: Request) {
  if (!isLoginConfigured() || (await auth())?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return Response.json({ error: "Unauthorised" }, { status: 401, headers: noCache });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 220000) {
    return Response.json({ error: "Proposal input exceeds the allowed limit." }, { status: 413, headers: noCache });
  }

  try {
    const body = await request.text();
    if (body.length > 220000) {
      return Response.json({ error: "Proposal input exceeds the allowed limit." }, { status: 413, headers: noCache });
    }
    const data = payload.parse(JSON.parse(body));
    const fundIds = new Set(data.funds.map(f=>f.id));
    if (fundIds.size !== data.funds.length || data.portfolios.some(p=>Object.keys(p.weights).some(id=>!fundIds.has(id)))) {
      return Response.json({ error: "Portfolio and fund identifiers must match." }, { status: 400, headers: noCache });
    }

    // Never misrepresent the prototype's synthetic or session-upload data as verified.
    const report = buildProposalReport(data);
    const buffer = await renderToBuffer(OmegaProposalPDF({ report }));

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...noCache,
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"Omega-Investment-Bond-Proposal.pdf\"",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid proposal input. Please review the entries." }, { status: 400, headers: noCache });
    }
    if (error instanceof Error && error.message.includes("allocations")) {
      return Response.json({ error: error.message }, { status: 400, headers: noCache });
    }
    // Do not leak sensitive client details or render errors in the response.
    console.error("Omega proposal PDF generation failed.");
    return Response.json({ error: "PDF generation failed. Please retry or contact the administrator." }, { status: 500, headers: noCache });
  }
}
