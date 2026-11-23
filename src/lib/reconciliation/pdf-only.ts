import type { ApprovedFund } from "@/lib/approved-funds";
import { workbookNameKey } from "./workbook-source";
import { similarity, type FactSheetData, type Review } from "./engine";

/**
 * Link an uploaded PDF to its workbook fund by the full, unique filename.
 *
 * Fund names and all published return values come exclusively from the latest
 * uploaded workbook. PDF content is supporting metadata only. A filename match
 * is NOT independent verification of the document's printed fund name, series,
 * investment suitability, data date or charges.
 */
export function reconcilePdfOnly(fund: ApprovedFund, factsheets: FactSheetData[]): Review {
  const target=workbookNameKey(fund.name);
  const exact=factsheets.filter(f=>
    /\.pdf$/i.test(f.filename) &&
    workbookNameKey(f.filename.replace(/\.pdf$/i,""))===target
  );

  // The filename includes the provider (Aviva, Zurich, New Ireland or
  // Standard Life). A unique provider-qualified exact filename is required.
  // Never use fuzzy title similarity to auto-link an unmatched document.
  const matched=exact.length===1?exact[0]:null;
  const approved=Boolean(matched);
  const otherCandidates=approved?[]:factsheets
    .filter(f=>/\.pdf$/i.test(f.filename))
    .map(f=>({
      factsheet:f,
      score:similarity(fund.name,f.filename.replace(/\.pdf$/i,""))
    }))
    .filter(v=>v.score>=0.30)
    .sort((a,b)=>b.score-a.score)
    .slice(0,10);
  const alternatives=exact.length?
    exact.map(f=>({factsheet:f,score:1})):otherCandidates;
  const titleMatches=matched?.title?
    workbookNameKey(matched.title)===target:null;

  const reason=approved
    ? "A unique uploaded PDF filename exactly matches this provider's current workbook fund name. "+
      "PDF content and share class have not been independently verified; "+
      "all displayed performance returns come from the uploaded workbook only."+
      (titleMatches===false?" The PDF's printed title differs; check document content separately.":"")
    : exact.length>1
      ? "Multiple uploaded PDFs have the same exact fund filename. Remove the duplicate to link one unambiguously."
      : "No uploaded PDF filename matches this workbook fund exactly. Check the filename and provider.";

  return {
    fundId:fund.id,provider:fund.provider,name:fund.name,
    status:approved?"auto_approved":exact.length>1?"needs_review":"unmatched",
    score:approved?1:0,
    factsheetScore:approved?1:0,
    workbookScore:0,
    factsheetIdentityApproved:approved,
    seriesIdentityApproved:approved,
    reason,workbookRow:null,factsheet:matched,
    alternativeRows:[],
    alternativeFactsheets:alternatives.map(v=>({
      importId:v.factsheet.importId,
      title:v.factsheet.title,
      filename:v.factsheet.filename,
      score:Math.round(v.score*1000)/1000
    }))
  };
}
