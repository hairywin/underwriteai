import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import type { AiDeepDive, PropertyFacts, RentComp, SaleComp, ScenarioResult, SensitivityGrid, UnderwritingInputs } from "../types";

export async function exportPdf(elementId: string, filename = "underwriteai-report.pdf") {
  const el = document.getElementById(elementId);
  if (!el) throw new Error("Report element not found.");
  const canvas = await html2canvas(el, { scale: 2, useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "pt", "a4");
  const width = pdf.internal.pageSize.getWidth();
  const height = (canvas.height * width) / canvas.width;
  let y = 0;
  pdf.addImage(imgData, "PNG", 0, y, width, height);
  while (height + y > pdf.internal.pageSize.getHeight()) {
    y -= pdf.internal.pageSize.getHeight();
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, y, width, height);
  }
  pdf.save(filename);
}

export function exportXlsx(args: {
  filename?: string;
  facts: PropertyFacts | null;
  inputs: UnderwritingInputs;
  results: ScenarioResult[];
  rentComps: RentComp[];
  saleComps: SaleComp[];
  sensitivity: SensitivityGrid;
  loanSchedule: { year: number; loanBalance: number; equity: number }[];
  memo?: AiDeepDive | null;
}) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.facts ? [args.facts] : []), "Property");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([args.inputs]), "Assumptions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.results), "Scenario Results");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.rentComps), "Rental Comps");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.saleComps), "Sales Comps");

  const cells = args.sensitivity.cells.flat();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cells), "Sensitivity Grid");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.loanSchedule), "Loan Schedule");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(args.inputs.unitMix), "Unit Mix");
  if (args.memo) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([args.memo]), "AI Memo");
  XLSX.writeFile(wb, args.filename || "underwriteai-report.xlsx");
}

export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
