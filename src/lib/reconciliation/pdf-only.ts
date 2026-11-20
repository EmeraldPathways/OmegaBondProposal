import type { ApprovedFund } from "@/lib/approved-funds";
import {
  classSignals, normalName, similarity,
  type FactSheetData, type Review
} from "./engine";

/**
 * Primary source reconciliation: an official PDF's internally printed name
 * establishes the fund identity. Workbook rows are never required for a match.
 *
 * This function proposes/approves SOURCE IDENTITY only. The separate PDF
 * performance parser and report validation determine whether returns can be
 * shown and whether they are suitable for client documents.
 */
export function reconcilePdfOnly(fund: ApprovedFund, factsheets: FactSheetData[]): Review {
  const ranked = factsheets
    .filter(f => f.providerHint === fund.provider && Boolean(f.title?.trim()))
    .map(f => {
      const printedScore=similarity(fund.name,f.title!);
      const cleanFilename=f.filename.replace(/\\.pdf$/i,"").replace(/^(Aviva|Zurich|New Ireland|Standard Life)\\s*[-_:]\\s*/i,"");
      const filenameExact=normalName(fund.name)===normalName(cleanFilename);
      // Filename is a candidate aid, never sufficient evidence:
      // require a compatible independent fund name extracted from inside the PDF.
      const filenameSupported=filenameExact&&printedScore>=0.55;
      return {document:f,printedScore,filenameSupported,
        score:filenameSupported?Math.max(printedScore,0.91):printedScore};
    })
    .filter(x => x.score >= 0.26)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  const title = best?.document.title ?? "";
  const exact = Boolean(best && normalName(fund.name) === normalName(title));

  // An explicit series, pension/growth or group designation in the approved
  // shortlist must also appear in the PDF itself. Never silently drop it.
  const expected = classSignals(fund.name);
  const printed = classSignals(title);
  const classConsistent = [...expected].every(signal => printed.has(signal)) &&
    [...printed].every(signal => expected.has(signal));
  const sameTitleCount = best
    ? ranked.filter(x => normalName(x.document.title!) === normalName(title)).length
    : 0;
  const distinct = Boolean(best && sameTitleCount === 1 &&
    (!second || best.score - second.score >= 0.055));

  // Avoid auto-approval on merely plausible names or competing share classes.
  const identityApproved = Boolean(best && classConsistent && distinct &&
    best.printedScore>=0.55 && (exact || best.printedScore>=0.80 || best.filenameSupported) &&
    best.score>=0.72);

  const status: Review["status"] = identityApproved ? "auto_approved" :
    best && best.score >= 0.45 ? "suggested" :
    best ? "needs_review" : "unmatched";

  const reason = identityApproved
    ? "Unique PDF fund identity corroborates the workbook name; renamed filename is not sole evidence. "+
      "The current workbook supplies returns; old PDF returns are reference-only."
    : !best
      ? "No plausible internally printed PDF title was found. Upload or review the fund factsheet."
      : !classConsistent
        ? "The official PDF does not confirm every series or share-class designation of the approved fund; review required."
        : !distinct
          ? "Several candidate PDF titles compete for this fund; manual confirmation required."
          : "Printed PDF title is plausible but not sufficiently corroborated for automatic approval.";

  return {
    fundId: fund.id, provider: fund.provider, name: fund.name,
    status, score: best?.score ?? 0, factsheetScore: best?.score ?? 0,
    workbookScore: 0, factsheetIdentityApproved: identityApproved,
    seriesIdentityApproved: identityApproved, reason,
    workbookRow: null, factsheet: best?.document ?? null,
    alternativeRows: [],
    alternativeFactsheets: ranked.slice(0, 10).map(x => ({
      importId: x.document.importId,
      title: x.document.title,
      filename: x.document.filename, // display only; never scored
      score: Math.round(x.score * 1000) / 1000
    }))
  };
}
