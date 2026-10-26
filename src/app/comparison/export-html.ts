import type { EmployeeDetail } from "@/app/actions/employees";
import { formatCurrency, formatDate, formatYears, compensationOnly } from "@/lib/format";

const FYS = [2021, 2022, 2023, 2024, 2025];

// Build a standalone, self-contained HTML document the user can open/present directly (D6).
export function buildComparisonHtml(details: EmployeeDetail[], compOnly: boolean): string {
    const esc = (s: any) => String(s ?? "-").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const names = details.map((d) => `<th>${esc(d.name)}</th>`).join("");

    const strip = `<div class="people">${details.map((d) => `
      <div class="person">
        ${d.photo ? `<img src="${esc(d.photo)}" alt="">` : `<div class="ph">${esc(d.name.split(" ").map((p) => p[0]).slice(0, 2).join(""))}</div>`}
        <div class="pn">${esc(d.name)}</div>
        <div class="pp">${esc(d.position_title)}</div>
      </div>`).join("")}</div>`;

    const personalRows: [string, (d: EmployeeDetail) => string][] = [
        ["Position", (d) => d.position_title || "-"],
        ["Company", (d) => d.banner_name || "-"],
        ["Country", (d) => d.country || "-"],
        ["Date of Birth", (d) => formatDate(d.date_of_birth)],
        ["Hire Date", (d) => formatDate(d.hire_date)],
        ["Years of Service", (d) => formatYears(d.hire_date)],
        ["Years in Position", (d) => formatYears(d.position_effective_date)],
        ["Status", (d) => d.status],
    ];
    const compRows: [string, (d: EmployeeDetail) => string][] = [
        ["Total Compensation", (d) => formatCurrency(d.total_compensation)],
        ["Base / Salary", (d) => formatCurrency(d.compensation?.base_salary)],
        ["STI Target", (d) => formatCurrency(d.compensation?.sti_target)],
        ["LTI Target", (d) => formatCurrency(d.compensation?.lti_target)],
        ["Other Bonus", (d) => formatCurrency(d.compensation?.other_bonus)],
        ["Allowance · Car", (d) => formatCurrency(d.compensation?.allowance_company_car)],
        ["Benefit · Medical", (d) => formatCurrency(d.compensation?.allowance_private_medical)],
    ];

    const section = (title: string, rows: [string, (d: EmployeeDetail) => string][], mono = false) => `
    <h2>${title}</h2>
    <table>
      <thead><tr><th>Field</th>${names}</tr></thead>
      <tbody>
        ${rows.map(([label, fn]) => `<tr><td class="field">${esc(label)}</td>${details.map((d) => `<td class="${mono ? "mono" : ""}">${esc(fn(d))}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`;

    // comp bar chart (pure CSS)
    const chartVals = details.map((d) => ({ name: d.name, v: compOnly ? compensationOnly(d.compensation) : (d.total_compensation || 0) })).sort((a, b) => b.v - a.v);
    const max = Math.max(...chartVals.map((c) => c.v), 1);
    const chart = `
    <h2>Compensation Comparison (${compOnly ? "compensation only, excl. benefits" : "total"})</h2>
    <div class="chart">
      ${chartVals.map((c) => `
        <div class="bar-row">
          <span class="bar-label">${esc(c.name)}</span>
          <span class="bar"><span class="bar-fill" style="width:${(c.v / max) * 100}%"></span></span>
          <span class="bar-val">${esc(formatCurrency(c.v))}</span>
        </div>`).join("")}
    </div>`;

    const perf = `
    <h2>Performance Grade — Last 5 Years</h2>
    <table>
      <thead><tr><th>Employee</th>${FYS.map((fy) => `<th>FY${fy}</th>`).join("")}</tr></thead>
      <tbody>
        ${details.map((d) => `<tr><td class="field">${esc(d.name)}</td>${FYS.map((fy) => `<td>${esc(d.performance.find((p) => p.fiscal_year === fy)?.grade || "-")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>`;

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Employee Comparison</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1e293b; margin: 0; padding: 32px; background: #f8fafc; }
  .wrap { max-width: 1100px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  h1 { color: #0e2841; margin: 0 0 4px; }
  .sub { color: #64748b; margin: 0 0 24px; font-size: 14px; }
  h2 { color: #0e2841; font-size: 15px; margin: 28px 0 10px; border-bottom: 2px solid #0e2841; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  thead th { background: #0e2841; color: #fff; font-weight: 600; }
  td.field { color: #64748b; }
  td.mono { font-family: ui-monospace, monospace; }
  .chart { padding: 8px 0; }
  .bar-row { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
  .bar-label { width: 140px; font-size: 13px; font-weight: 500; }
  .bar { flex: 1; background: #e2e8f0; border-radius: 6px; height: 22px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; background: linear-gradient(90deg,#0e2841,#3b6ea5); }
  .bar-val { width: 110px; text-align: right; font-family: ui-monospace, monospace; font-size: 13px; font-weight: 600; color: #0e2841; }
  .footer { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 11px; }
  .people { display: flex; gap: 16px; margin: 16px 0 8px; }
  .person { flex: 1; text-align: center; }
  .person img, .person .ph { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; margin: 0 auto 6px; }
  .person .ph { display: flex; align-items: center; justify-content: center; background: #0e2841; color: #fff; font-weight: 700; }
  .person .pn { font-weight: 600; font-size: 13px; color: #0e2841; }
  .person .pp { font-size: 11px; color: #64748b; }
  @media print { body { padding: 0; background: #fff; } .wrap { box-shadow: none; } }
</style></head>
<body><div class="wrap">
  <h1>Employee Comparison</h1>
  <p class="sub">${details.length} employees · generated ${new Date().toLocaleString("en-GB")} · Royal Flush ATS</p>
  ${strip}
  ${chart}
  ${section("Personal & Employment Information", personalRows)}
  ${section("Compensation & Benefits", compRows, true)}
  ${perf}
  <p class="footer">Confidential — For Internal Use Only</p>
</div></body></html>`;
}
