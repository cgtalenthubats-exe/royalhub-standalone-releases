import type { EmployeeDetail } from "@/app/actions/employees";
import { formatCurrency, formatDate, formatYears, calcAge, estimatedRetirementDate, yearsUntil } from "@/lib/format";

// Standalone, self-contained HTML profile the user can open / present / print to PDF.
// canSeePersonal mirrors the same gate PersonalEmploymentCard uses for
// Age/Estimated Retirement — date_of_birth itself isn't redacted server-side,
// so without this an unauthorized user could print what the profile page hides.
export function buildProfileHtml(emp: EmployeeDetail, canSeePersonal: boolean): string {
    const esc = (s: any) => String(s ?? "-").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const c = emp.compensation;
    // Precise (not rounded-to-whole-%) percentage of base salary, matching
    // the read-only display on CompensationBenefitsCard.
    const pctOfBase = (amt: number | null | undefined): string => {
        if (amt == null || !c?.base_salary) return "";
        return ` (${((amt / c.base_salary) * 100).toFixed(1)}%)`;
    };

    const kv = (rows: [string, string][]) =>
        rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join("");

    const personal: [string, string][] = [
        ["Date of Birth", formatDate(emp.date_of_birth)],
        ["Hire Date", formatDate(emp.hire_date)],
        ["Years of Service", formatYears(emp.hire_date)],
        ["Current Job Effective Date", formatDate(emp.position_effective_date)],
        ["Years in Position", formatYears(emp.position_effective_date)],
        ["Nationality", emp.nationality || "-"],
        ["Gender", emp.gender || "-"],
        ["Country / City", [emp.country, emp.city].filter(Boolean).join(" · ")],
        ["Job Grade", emp.job_grade || "-"],
        ["Status", emp.status],
    ];
    if (canSeePersonal) {
        const age = calcAge(emp.date_of_birth);
        const retireDate = estimatedRetirementDate(emp.date_of_birth, emp.retirement_age);
        personal.push(
            ["Age", age != null ? `${age}` : "-"],
            ["Estimated Retirement", retireDate ? `${formatDate(retireDate.toISOString())} (${yearsUntil(retireDate)} yrs from now)` : (emp.retirement_age ? "-" : "-")],
        );
    }
    const comp: [string, string][] = [
        ["Total Compensation", formatCurrency(emp.total_compensation)],
        ["Base / Salary", formatCurrency(c?.base_salary)],
        ["STI Target", formatCurrency(c?.sti_target) + pctOfBase(c?.sti_target)],
        ["STI Max", formatCurrency(c?.sti_max) + pctOfBase(c?.sti_max)],
        ["LTI Target", formatCurrency(c?.lti_target) + pctOfBase(c?.lti_target)],
        ["LTI Max", formatCurrency(c?.lti_max) + pctOfBase(c?.lti_max)],
        ["Other Bonus", formatCurrency(c?.other_bonus)],
        ["Allowance · Company Car", formatCurrency(c?.allowance_company_car)],
        ["Allowance · Mobile", formatCurrency(c?.allowance_mobility)],
        ["Allowance · Housing", formatCurrency(c?.allowance_home_office)],
        ["Benefit · Medical", formatCurrency(c?.allowance_private_medical)],
        ["Other benefit (please specify)", c?.allowance_family_cover || "-"],
    ];
    const perf = emp.performance.map((p) =>
        `<div class="grade"><div class="fy">FY${p.fiscal_year}</div><div class="g">${esc(p.grade)}</div><div class="l">${esc(p.label)}</div></div>`
    ).join("");

    const careerRows = [...emp.employment_history].sort((a: any, b: any) => new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime());
    const career = careerRows.length
        ? `<table><thead><tr><th class="label">Period</th><th class="label">Position</th></tr></thead><tbody>${careerRows.map((h: any) =>
            `<tr><td class="label">${esc(formatDate(h.start_date))} – ${h.end_date ? esc(formatDate(h.end_date)) : "Current"}</td><td class="label">${esc(h.position)}${h.banner ? ` · ${esc(h.banner)}` : ""}</td></tr>`
          ).join("")}</tbody></table>`
        : "<p class='muted'>No career history recorded.</p>";

    const compHistoryRows = [...emp.comp_history].sort((a: any, b: any) => (b.fiscal_year ?? 0) - (a.fiscal_year ?? 0));
    const compHistory = compHistoryRows.length
        ? `<table><thead><tr><th class="label">FY</th><th>Base</th><th>STI</th><th>LTI</th><th>Total</th></tr></thead><tbody>${compHistoryRows.map((h: any) =>
            `<tr><td class="label">${esc(h.fiscal_year)}</td><td class="v">${esc(formatCurrency(h.base_salary))}</td><td class="v">${esc(formatCurrency(h.sti_amount))}</td><td class="v">${esc(formatCurrency(h.lti_amount))}</td><td class="v">${esc(formatCurrency(h.total_comp))}</td></tr>`
          ).join("")}</tbody></table>`
        : "<p class='muted'>No compensation history recorded.</p>";

    const avatar = emp.photo
        ? `<img src="${esc(emp.photo)}" class="avatar" alt="">`
        : `<div class="avatar initials">${esc(emp.name.split(" ").map((p) => p[0]).slice(0, 2).join(""))}</div>`;

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(emp.name)} — Employee Profile</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1e293b; margin: 0; padding: 32px; background: #f8fafc; }
  .wrap { max-width: 960px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .hero { display: flex; align-items: center; gap: 20px; border-bottom: 2px solid #0e2841; padding-bottom: 20px; }
  .avatar { width: 88px; height: 88px; border-radius: 50%; object-fit: cover; }
  .avatar.initials { display: flex; align-items: center; justify-content: center; background: #0e2841; color: #fff; font-size: 30px; font-weight: 700; }
  h1 { color: #0e2841; margin: 0; }
  .sub { color: #64748b; }
  h2 { color: #0e2841; font-size: 14px; margin: 26px 0 8px; text-transform: uppercase; letter-spacing: .03em; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 6px 8px; border-bottom: 1px solid #eef2f7; }
  td:first-child, th:first-child { padding-left: 0; }
  td:last-child, th:last-child { padding-right: 0; }
  th { text-align: right; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; font-weight: 600; }
  th.label, td.label { text-align: left; }
  td.k { color: #64748b; } td.v { text-align: right; font-weight: 500; }
  .grades { display: flex; gap: 10px; flex-wrap: wrap; }
  .grade { text-align: center; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; }
  .grade .fy { font-size: 11px; color: #64748b; } .grade .g { font-size: 20px; font-weight: 700; color: #0e2841; } .grade .l { font-size: 10px; color: #94a3b8; }
  .muted { color: #94a3b8; }
  .footer { margin-top: 28px; text-align: center; color: #94a3b8; font-size: 11px; }
  @media print { body { padding: 0; background: #fff; } .wrap { box-shadow: none; } }
</style></head>
<body><div class="wrap">
  <div class="hero">
    ${avatar}
    <div><h1>${esc(emp.name)}</h1>
      <div class="sub">${esc(emp.position_title)} · ${esc(emp.banner_name)} · ${esc(emp.country)}</div>
      <div class="sub">Total Comp ${esc(formatCurrency(emp.total_compensation))} · ${esc(formatYears(emp.hire_date))} service · Team ${emp.team_size}</div>
    </div>
  </div>
  <div class="cols">
    <div><h2>Personal & Employment</h2><table>${kv(personal)}</table></div>
    <div><h2>Compensation & Benefits</h2><table>${kv(comp)}</table></div>
  </div>
  <h2>Performance — Last 5 Years</h2><div class="grades">${perf}</div>
  <div class="cols">
    <div><h2>Career History</h2>${career}</div>
    <div><h2>Compensation History</h2>${compHistory}</div>
  </div>
  <p class="footer">Confidential — For Internal Use Only · Royal Flush ATS · ${new Date().toLocaleString("en-GB")}</p>
</div></body></html>`;
}
