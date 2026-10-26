"use client";

import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { WizardStepsDiagram, TotalCompDiagram, ReviewFlowDiagram, OrgDimensionsDiagram } from "./user-guide-diagrams";

interface GuideSection {
    id: string;
    title_en: string;
    title_th: string;
    body_en: string[];
    body_th: string[];
    // Language-agnostic (box labels are the real on-screen English UI terms
    // either way) — a short caption right above it still switches with lang,
    // added inline in body_en/body_th as the line right before the diagram
    // renders, so the diagram itself doesn't need a translated variant.
    diagram?: ReactNode;
}

// Content is grounded in the app's actual behavior (checked against the
// running code, not aspirational) — update this alongside any feature that
// changes what's described here.
const SECTIONS: GuideSection[] = [
    {
        id: "start",
        title_en: "Getting Started",
        title_th: "เริ่มต้นใช้งาน",
        body_en: [
            "Log in with your work Microsoft account (\"Sign in with Microsoft\"), or with the username/password your admin gave you if you haven't been moved over to Microsoft sign-in yet.",
            "The top navigation takes you to Employees, Positions, Org (chart views), Succession Plan, Proposals, and Documentation.",
            "What you can see and edit depends on your role — see \"Roles & Permissions\" below. Some fields may show as hidden or blurred if you don't have access to compensation or personal data.",
        ],
        body_th: [
            "เข้าสู่ระบบด้วยบัญชี Microsoft ที่ใช้ทำงาน (\"Sign in with Microsoft\") หรือใช้ username/password ที่แอดมินให้มา ถ้ายังไม่ได้ย้ายมาใช้ Microsoft sign-in",
            "เมนูด้านบนพาไปหน้า Employees, Positions, Org (มุมมองผังองค์กร), Succession Plan, Proposals, และ Documentation",
            "สิ่งที่เห็น/แก้ไขได้ขึ้นอยู่กับสิทธิ์ของคุณ — ดูหัวข้อ \"สิทธิ์การใช้งาน\" ด้านล่าง บางช่องอาจถูกซ่อนหรือเบลอถ้าคุณไม่มีสิทธิ์ดูข้อมูลเงินเดือน/ข้อมูลส่วนตัว",
        ],
    },
    {
        id: "employees-list",
        title_en: "Employees List",
        title_th: "หน้ารายชื่อพนักงาน",
        body_en: [
            "The Employees page lists everyone, with filters for Company, Country, Function, and Status, plus a free-text search.",
            "Click any row to open that person's full profile.",
            "Buttons at the top: Add Employee, Import CSV, Export CSV, Template (downloads a blank CSV to fill in).",
        ],
        body_th: [
            "หน้า Employees แสดงรายชื่อพนักงานทั้งหมด กรองได้ตามบริษัท, ประเทศ, สายงาน, สถานะ และค้นหาด้วยชื่อได้",
            "คลิกที่แถวไหนก็ได้เพื่อเปิดดูโปรไฟล์เต็มของคนนั้น",
            "ปุ่มด้านบน: Add Employee (เพิ่มพนักงาน), Import CSV (นำเข้า), Export CSV (ส่งออก), Template (โหลดไฟล์ CSV เปล่าไปกรอก)",
        ],
    },
    {
        id: "add-employee",
        title_en: "Creating an Employee",
        title_th: "การสร้างพนักงานใหม่",
        body_en: [
            "Click \"Add Employee\" — a 6-step wizard opens: Personal & Employment, Compensation & Benefits, Compensation History, Career History, Background & Résumé, Review.",
            "Only Name, Company/Office, and Position are required on step 1 — everything else can be filled in later from the profile.",
            "\"Reports to\" (optional) lets you place the new hire on the org chart immediately, instead of doing it separately afterward.",
            "If the company/office or position you need doesn't exist yet, click \"+ New\" next to that field to create it on the spot.",
            "Compensation fields (STI/LTI Target/Max) are entered as a % of base salary — the € amount is calculated automatically underneath.",
            "The Review step (last) shows everything you entered, itemized — check it before clicking \"Create Employee.\"",
        ],
        body_th: [
            "กดปุ่ม \"Add Employee\" — จะเปิด wizard 6 ขั้นตอน: Personal & Employment, Compensation & Benefits, Compensation History, Career History, Background & Résumé, Review",
            "ขั้นตอนที่ 1 บังคับกรอกแค่ ชื่อ, บริษัท/office, และตำแหน่ง เท่านั้น ส่วนอื่นๆ กรอกทีหลังจากหน้าโปรไฟล์ได้",
            "ช่อง \"Reports to\" (ไม่บังคับ) ให้เลือกหัวหน้าได้เลยตอนสร้าง จะได้ขึ้นผังองค์กรทันที ไม่ต้องไปตั้งแยกทีหลัง",
            "ถ้าบริษัท/office หรือตำแหน่งที่ต้องการยังไม่มีในระบบ กดปุ่ม \"+ New\" ข้างช่องนั้นเพื่อสร้างใหม่ได้เลย",
            "ช่องเงินเดือน (STI/LTI Target/Max) กรอกเป็น % ของฐานเงินเดือน ระบบจะคำนวณเป็น € ให้อัตโนมัติด้านล่าง",
            "ขั้นตอนสุดท้าย (Review) จะโชว์ข้อมูลทั้งหมดที่กรอกไว้แบบละเอียด ให้ตรวจสอบก่อนกด \"Create Employee\"",
        ],
        diagram: <WizardStepsDiagram />,
    },
    {
        id: "profile",
        title_en: "Employee Profile",
        title_th: "หน้าโปรไฟล์พนักงาน",
        body_en: [
            "The profile page has several cards, each independently editable (click \"Edit\" on that card):",
            "• Personal & Employment — DOB, hire date, nationality, gender, job grade, retirement age. Age and Estimated Retirement (with years-remaining) only show if you have permission to see personal data.",
            "• Compensation & Benefits — base salary, STI/LTI Target/Max (shown as both % and €), allowances. Only visible/editable if you have compensation access.",
            "• Performance — grades for the last 5 fiscal years.",
            "• Org Snapshot — shows the person's place in the org chart. Click \"Edit\" to change who they report to in each dimension (Company, Function, Headcount), or \"Full Org\" to see their whole subtree.",
            "• Competency Scores — Leadership/Experience/Skill/Market vs. the position's requirement.",
            "• Departments Managed / Compensation History / Career History — add past fiscal years or previous roles.",
            "• Documents — upload files specific to this person (contracts, reviews, etc.).",
            "• Planning tag — the colored dot next to their name. Click it to mark them with a color for your own planning use (no fixed meaning — e.g. use it for a restructuring plan).",
            "\"Print / PDF\" at the top exports a clean one-page profile, matching what's on screen.",
        ],
        body_th: [
            "หน้าโปรไฟล์แบ่งเป็นการ์ดหลายส่วน แก้ไขแยกกันได้ (กด \"Edit\" ที่การ์ดนั้นๆ):",
            "• Personal & Employment — วันเกิด, วันเริ่มงาน, สัญชาติ, เพศ, เกรดตำแหน่ง, อายุเกษียณ ช่อง Age และ Estimated Retirement (พร้อมบอกว่าเหลืออีกกี่ปี) จะโชว์เฉพาะถ้าคุณมีสิทธิ์ดูข้อมูลส่วนตัว",
            "• Compensation & Benefits — เงินเดือนฐาน, STI/LTI Target/Max (โชว์ทั้ง % และ €), เบี้ยเลี้ยงต่างๆ จะเห็น/แก้ได้เฉพาะถ้ามีสิทธิ์ดูเงินเดือน",
            "• Performance — เกรดผลงานย้อนหลัง 5 ปี",
            "• Org Snapshot — โชว์ตำแหน่งของคนนี้ในผังองค์กร กด \"Edit\" เพื่อเปลี่ยนหัวหน้าในแต่ละมิติ (บริษัท, สายงาน, Headcount) หรือกด \"Full Org\" เพื่อดูทีมทั้งหมดใต้คนนี้",
            "• Competency Scores — คะแนน Leadership/Experience/Skill/Market เทียบกับที่ตำแหน่งต้องการ",
            "• Departments Managed / Compensation History / Career History — เพิ่มข้อมูลปีงบประมาณเก่าหรือประวัติการทำงานก่อนหน้า",
            "• Documents — อัปโหลดไฟล์เฉพาะของคนนี้ (สัญญาจ้าง, ผลประเมิน ฯลฯ)",
            "• Planning tag — จุดสีข้างชื่อ กดเพื่อติดสีสำหรับวางแผนของคุณเอง (ไม่มีความหมายตายตัว เช่น ใช้วางแผน restructuring)",
            "ปุ่ม \"Print / PDF\" ด้านบนส่งออกโปรไฟล์เป็นเอกสาร 1 หน้า ตรงกับที่เห็นบนจอ",
        ],
    },
    {
        id: "calculations",
        title_en: "How Things Are Calculated",
        title_th: "การคำนวณต่างๆ ในระบบ",
        body_en: [
            "A few numbers on screen are derived from other fields, not typed in directly. Knowing which is which avoids confusion when two totals that sound the same don't match.",
            "Total Compensation (calculated) — shown in the Add Employee wizard, the Compensation & Benefits card, and What-if scenarios:",
            "= Base Salary + STI Target (€) + LTI Target (€) + Other Bonus",
            "Excludes all allowances/benefits (Car, Mobile, Housing, Medical) and both STI/LTI Max fields — those are budget ceilings, not part of what's actually paid out.",
            "STI/LTI Target & Max — you always type the %, the € is always derived, never the other way round:",
            "= round( Base Salary × % ÷ 100 )",
            "Compensation History's yearly Total — a different formula from the one above, on purpose (it reflects what was actually paid that fiscal year, not this year's target):",
            "= Base Salary + STI Actual (€) + LTI Actual (€)",
            "Uses Actual %, not Target %, and leaves out Other Bonus, Cash Allowance, and Pension even though those are tracked on the same row. Don't expect this to match \"Total Compensation (calculated)\" above — they're answering different questions.",
            "Age — whole years elapsed since Date of Birth (floored: your birthday hasn't happened yet this year, you're still last year's age).",
            "Estimated Retirement — Date of Birth + Retirement Age (years). The \"N yrs from now\" next to it is the same floored whole-years logic, counting forward instead of back.",
            "Years of Service / Years in Position — whole years + months elapsed since Hire Date / Current Job Effective Date.",
            "FTE rollup (Org Chart's FTE view) — each card's own headcount = 1 (if a real employee) + the headcount of any department buckets they own directly. A card's Total = its own headcount + everyone below it in that tree, added up.",
            "Head of Function ≠ automatic linking — picking someone as Head of Function only marks who the anchor is. It does not connect anyone else's reporting line by itself; each other company's lead still needs to be pointed at them separately, by dragging on the chart or through their own Org Snapshot editor.",
            "Compensation & personal-data visibility — controlled by role plus a per-user override (see Roles & Permissions below), and checked on the server before the data is sent — not just hidden in the browser. A restricted user's screen shows the field as hidden/blurred because the number never arrived, not because CSS is covering it up.",
        ],
        body_th: [
            "ตัวเลขบางตัวบนหน้าจอเป็นค่าที่คำนวณมาจากช่องอื่น ไม่ได้พิมพ์เข้าไปตรงๆ รู้ไว้ก่อนจะได้ไม่งงเวลาเจอยอดรวม 2 ที่ชื่อคล้ายกันแต่ตัวเลขไม่ตรงกัน",
            "Total Compensation (calculated) — โชว์ใน Add Employee wizard, การ์ด Compensation & Benefits, และ What-if scenarios:",
            "= เงินเดือนฐาน + STI Target (€) + LTI Target (€) + Other Bonus",
            "ไม่รวมเบี้ยเลี้ยง/สวัสดิการทุกอย่าง (รถ, มือถือ, ที่พัก, ประกันสุขภาพ) และไม่รวม STI/LTI Max ทั้งคู่ — เพราะสองอันนั้นเป็นเพดานงบ ไม่ใช่เงินที่จ่ายจริง",
            "STI/LTI Target และ Max — พิมพ์เป็น % เสมอ ส่วน € เป็นค่าที่คำนวณมาให้เสมอ ไม่มีทางพิมพ์ € ตรงๆ ได้เลย:",
            "= round( เงินเดือนฐาน × % ÷ 100 )",
            "ยอดรวมรายปีใน Compensation History — ใช้สูตรคนละแบบกับด้านบน ตั้งใจให้ต่างกัน (เพราะอันนี้สะท้อนสิ่งที่จ่ายจริงในปีงบนั้น ไม่ใช่เป้าปีนี้):",
            "= เงินเดือนฐาน + STI Actual (€) + LTI Actual (€)",
            "ใช้ % Actual ไม่ใช่ % Target และไม่รวม Other Bonus, Cash Allowance, Pension แม้จะมีช่องให้กรอกอยู่ในแถวเดียวกันก็ตาม อย่าคาดหวังว่ายอดนี้จะตรงกับ \"Total Compensation (calculated)\" ด้านบน — เป็นคนละคำถามกัน",
            "Age — จำนวนปีเต็มที่ผ่านมาแล้วนับจากวันเกิด (ปัดลง: ถ้ายังไม่ถึงวันเกิดปีนี้ ก็ยังนับเป็นอายุของปีที่แล้ว)",
            "Estimated Retirement — วันเกิด + อายุเกษียณ (ปี) ส่วน \"อีก N ปี\" ข้างๆ ก็ใช้หลักปัดลงแบบเดียวกัน แค่นับไปข้างหน้าแทนนับย้อนหลัง",
            "Years of Service / Years in Position — จำนวนปี+เดือนเต็มที่ผ่านมาแล้วนับจากวันเริ่มงาน / วันเริ่มตำแหน่งปัจจุบัน",
            "FTE rollup (มุมมอง FTE ของ Org Chart) — แต่ละการ์ดมี headcount ของตัวเอง = 1 (ถ้าเป็นพนักงานจริง) + headcount ของ department bucket ที่ตัวเองดูแลโดยตรง ส่วน Total ของการ์ดนั้น = headcount ตัวเอง + ทุกคนที่อยู่ใต้มันในผังนั้น รวมกัน",
            "Head of Function ≠ เชื่อมสายงานให้อัตโนมัติ — การเลือกใครเป็น Head of Function แค่ปักหมุดว่าใครคือหัวเรื่อง ไม่ได้ลากเส้นเชื่อมให้ใครเลย ต้องไปเชื่อมสายงานของบริษัทอื่นเองอีกที ไม่ว่าจะลากบนผัง หรือใช้ Org Snapshot editor ของคนนั้นเอง",
            "การเห็นข้อมูลเงินเดือน/ข้อมูลส่วนตัว — ควบคุมด้วย role บวกกับการตั้งค่าเฉพาะราย (ดูหัวข้อสิทธิ์การใช้งานด้านล่าง) และถูกเช็คที่ฝั่งเซิร์ฟเวอร์ก่อนส่งข้อมูลออกมา ไม่ใช่แค่ซ่อนที่หน้าจอ — user ที่ถูกจำกัดจะเห็นช่องนั้นเป็นซ่อน/เบลอ เพราะตัวเลขไม่เคยถูกส่งมาถึงเลย ไม่ใช่แค่มี CSS มาบังไว้",
        ],
        diagram: <TotalCompDiagram />,
    },
    {
        id: "import-export",
        title_en: "Import / Export (CSV)",
        title_th: "นำเข้า / ส่งออก (CSV)",
        body_en: [
            "\"Template\" downloads a blank CSV with the right column headers.",
            "\"Import CSV\" reads your file and shows a review screen before anything is saved:",
            "• Possible duplicates — someone with a very similar name already exists. Choose Skip or Import anyway.",
            "• Needs resolution — the Company/Country or Position in your file doesn't exist yet. Add it inline with \"+ Add office\" / \"+ Add position\", or skip the row.",
            "• Ready to import — everything matched cleanly, collapsed by default.",
            "• Couldn't import — rows with a missing name or invalid status. Fix these in the file and re-upload.",
            "Nothing is saved until you click \"Import N employees\" at the bottom.",
            "\"Export CSV\" downloads everyone currently shown in the table (respects your active filters).",
        ],
        body_th: [
            "\"Template\" โหลดไฟล์ CSV เปล่าที่มี column header ถูกต้องให้",
            "\"Import CSV\" จะอ่านไฟล์แล้วโชว์หน้า review ก่อน save ทุกครั้ง:",
            "• Possible duplicates — เจอชื่อที่คล้ายกับคนที่มีอยู่แล้วมาก เลือกได้ว่าจะ Skip หรือ Import anyway",
            "• Needs resolution — บริษัท/ประเทศ หรือตำแหน่งในไฟล์ยังไม่มีในระบบ เพิ่มได้เลยด้วย \"+ Add office\" / \"+ Add position\" หรือจะข้ามแถวนั้นก็ได้",
            "• Ready to import — ข้อมูลตรงกับระบบครบ พับเก็บไว้เป็น default",
            "• Couldn't import — แถวที่ไม่มีชื่อหรือ status ผิด ต้องไปแก้ในไฟล์แล้วอัปโหลดใหม่",
            "ข้อมูลจะยังไม่ถูก save จนกว่าจะกด \"Import N employees\" ด้านล่าง",
            "\"Export CSV\" ดาวน์โหลดรายชื่อทั้งหมดที่โชว์อยู่ในตารางตอนนั้น (ตามตัวกรองที่เลือกไว้)",
        ],
        diagram: <ReviewFlowDiagram steps={["Upload CSV", "Analyze", "Review\n(4 buckets)", "Import"]} />,
    },
    {
        id: "orgchart",
        title_en: "Org Chart",
        title_th: "ผังองค์กร",
        body_en: [
            "Three views, switchable at the top: By Company (real management chain), By Function (each company's own HR/Finance/etc. hierarchy, or one function across every company), FTE (headcount rollup).",
            "Drag a card onto another to reassign their manager — a fit-check scorecard appears before you confirm.",
            "Layout buttons: Expand / Collapse / Compact / Stack V1 / Stack V2 — different ways to fit a large chart on screen.",
            "\"Head of Function\" (only on the By Function view, when viewing one function across all companies): pick who the overall global head is. This alone doesn't create reporting lines — you still connect other companies' leads to them by dragging, or via that person's own Org Snapshot editor.",
            "Export to PPTX or PNG from the toolbar.",
            "A colored stripe on a card is someone's planning tag (see Employee Profile above).",
        ],
        body_th: [
            "มี 3 มุมมอง สลับได้ด้านบน: By Company (สายบังคับบัญชาจริง), By Function (แต่ละบริษัทมีโครงสร้าง HR/Finance ฯลฯ ของตัวเอง หรือดูสายงานเดียวข้ามทุกบริษัทก็ได้), FTE (สรุปจำนวนหัวคน)",
            "ลากการ์ดไปวางบนอีกใบเพื่อเปลี่ยนหัวหน้า — จะมี fit-check scorecard ขึ้นมาให้ยืนยันก่อน",
            "ปุ่มจัด layout: Expand / Collapse / Compact / Stack V1 / Stack V2 — วิธีจัดผังใหญ่ให้พอดีจอ",
            "\"Head of Function\" (เฉพาะหน้า By Function ตอนดูสายงานเดียวข้ามทุกบริษัท): เลือกว่าใครเป็นหัวหน้าสายงานนั้นภาพรวม การเลือกนี้ไม่ได้ลากเส้นให้อัตโนมัติ ต้องไปเชื่อมสายงานของบริษัทอื่นเองอีกที (ลากบนผัง หรือใช้ Org Snapshot editor ของคนนั้น)",
            "Export เป็น PPTX หรือ PNG ได้จาก toolbar",
            "แถบสีบนการ์ด คือ planning tag ของคนนั้น (ดูหัวข้อ Employee Profile)",
        ],
        diagram: <OrgDimensionsDiagram />,
    },
    {
        id: "ocr",
        title_en: "OrgChart OCR Upload",
        title_th: "อัปโหลดผังองค์กร (OCR)",
        body_en: [
            "On the \"By Company\" org chart page, click \"Upload Org Chart.\"",
            "Upload one PDF or image at a time (multi-page PDFs are fine — the whole chart in one file).",
            "Gemini reads the file and matches names against your existing employees:",
            "• New people — not found in the system. Resolve their Company/Office and Position (dropdown, or \"+ New\" to create), then they're included. If many people are new (e.g. a whole new company's chart), tick the ones you want and use the bulk \"Apply to selected\" tool instead of doing each one by hand.",
            "• Needs review — name matches an existing employee, but the chart shows a different company or title. A link takes you to that person's profile to check and fix it yourself — nothing is changed automatically.",
            "• Already match — no changes needed, collapsed by default.",
            "• Couldn't read — too unclear to trust. Not imported.",
            "Nothing is saved until you click \"Add N employees.\"",
            "If extraction fails, click \"Try again\" — it doesn't always succeed on the first try with a large file.",
        ],
        body_th: [
            "ที่หน้าผังองค์กร \"By Company\" กดปุ่ม \"Upload Org Chart\"",
            "อัปโหลดทีละ 1 ไฟล์ (PDF หลายหน้าได้ — เอาผังทั้งหมดในไฟล์เดียว)",
            "Gemini จะอ่านไฟล์แล้วจับคู่ชื่อกับพนักงานที่มีอยู่แล้ว:",
            "• New people — ไม่พบในระบบ ต้องเลือกบริษัท/Office และตำแหน่งให้ (จาก dropdown หรือกด \"+ New\" สร้างใหม่) แล้วค่อยรวมเข้ารายการ ถ้ามีคนใหม่เยอะ (เช่น ทั้งบริษัทใหม่) ให้ติ๊กเลือกคนที่ต้องการแล้วใช้เครื่องมือ bulk \"Apply to selected\" แทนการทำทีละคน",
            "• Needs review — ชื่อตรงกับคนที่มีอยู่แล้ว แต่ชาร์ตโชว์บริษัท/ตำแหน่งไม่ตรงกับในระบบ มีลิงก์ไปหน้าโปรไฟล์คนนั้นให้ไปตรวจสอบ/แก้เอง ระบบจะไม่แก้ให้อัตโนมัติ",
            "• Already match — ไม่ต้องทำอะไร พับเก็บไว้เป็น default",
            "• Couldn't read — อ่านไม่ชัดพอจะเชื่อได้ ไม่ import",
            "ข้อมูลจะยังไม่ save จนกว่าจะกด \"Add N employees\"",
            "ถ้าอ่านไฟล์ไม่สำเร็จ กด \"Try again\" ได้เลย บางครั้ง Gemini ก็ไม่สำเร็จในรอบแรกถ้าไฟล์ใหญ่",
        ],
        diagram: <ReviewFlowDiagram steps={["Upload PDF", "Gemini reads it", "Review\n(4 buckets)", "Add employees"]} />,
    },
    {
        id: "positions",
        title_en: "Positions & Competency",
        title_th: "ตำแหน่งงานและ Competency",
        body_en: [
            "The Positions page lists every job position with its competency requirements (Leadership/Experience/Skill/Market, 1–10 scale) and headcount.",
            "Add or edit a position, including an optional Job Description (text and/or a PDF attachment).",
            "These requirements are what an employee's own Competency Scores are compared against on their profile.",
        ],
        body_th: [
            "หน้า Positions แสดงตำแหน่งงานทั้งหมด พร้อมเกณฑ์ที่ต้องการ (Leadership/Experience/Skill/Market สเกล 1–10) และจำนวนคนในตำแหน่งนั้น",
            "เพิ่ม/แก้ไขตำแหน่งได้ ใส่ Job Description (ข้อความ และ/หรือแนบไฟล์ PDF) ได้",
            "เกณฑ์เหล่านี้คือสิ่งที่คะแนน Competency ของพนักงานแต่ละคนจะถูกเทียบด้วยในหน้าโปรไฟล์",
        ],
    },
    {
        id: "succession",
        title_en: "Succession Planning",
        title_th: "แผนสืบทอดตำแหน่ง",
        body_en: [
            "The Succession Plan page lets you build a seat-based tree of key positions and rank candidates for each seat.",
            "Use it to identify readiness gaps and plan who's next in line for critical roles.",
        ],
        body_th: [
            "หน้า Succession Plan ให้สร้างผังตำแหน่งสำคัญ (seat) และจัดอันดับผู้สืบทอดสำหรับแต่ละตำแหน่งได้",
            "ใช้เพื่อดูช่องว่างความพร้อม และวางแผนว่าใครจะสืบทอดตำแหน่งสำคัญต่อไป",
        ],
    },
    {
        id: "proposals",
        title_en: "Proposals & Compensation Review",
        title_th: "Proposal และการทบทวนเงินเดือน",
        body_en: [
            "Create a salary proposal for a specific employee: current vs. proposed compensation, pinned peer comparisons, and What-if scenarios (simulate a change and see the effect before committing).",
            "\"AI Talent Assessment\" (if enabled) generates a qualitative summary — fit, market context — based on the proposal and its comparison peers. Only runs when you click Generate, never automatically.",
            "Proposals move through statuses (draft → submitted → approved) as they're reviewed.",
        ],
        body_th: [
            "สร้าง salary proposal ให้พนักงานคนใดคนหนึ่งได้: เทียบเงินเดือนปัจจุบันกับที่เสนอ, ปักคนไว้เทียบ (comparison), และ What-if scenarios (จำลองการเปลี่ยนแปลงดูผลก่อนตัดสินใจจริง)",
            "\"AI Talent Assessment\" (ถ้าเปิดใช้งาน) จะสรุปเชิงคุณภาพให้ — ความเหมาะสม, บริบทตลาด — จากข้อมูล proposal และคนที่ปักไว้เทียบ ทำงานเฉพาะตอนกด Generate เท่านั้น ไม่ทำงานอัตโนมัติ",
            "Proposal จะมีสถานะ (draft → submitted → approved) ตามขั้นตอนการอนุมัติ",
        ],
    },
    {
        id: "documents",
        title_en: "Document Center",
        title_th: "ศูนย์เอกสาร",
        body_en: [
            "General company documents live in the Document Center (folders, like a shared drive) — separate from documents attached to a specific employee's profile.",
            "Upload, organize into folders, and preview supported file types inline.",
        ],
        body_th: [
            "เอกสารทั่วไปของบริษัทเก็บไว้ที่ Document Center (จัดเป็นโฟลเดอร์ เหมือน shared drive) — แยกจากเอกสารที่แนบไว้ในโปรไฟล์พนักงานแต่ละคน",
            "อัปโหลด, จัดเก็บเป็นโฟลเดอร์, และดูตัวอย่างไฟล์ที่รองรับได้ทันทีในหน้าเว็บ",
        ],
    },
    {
        id: "admin",
        title_en: "Settings & Administration (super users only)",
        title_th: "Settings และงานแอดมิน (super user เท่านั้น)",
        body_en: [
            "Gemini API Key — needed for Key Insights, AI Talent Assessment, and OrgChart OCR upload. Falls back to a server default if left blank.",
            "Companies & logos — create a new company, upload/crop its logo (drag to reposition, slider to zoom — framed exactly as it'll appear on the org chart), and manage each company's country offices (add/edit/remove).",
            "Users & access — create logins, set each person's role (super/regular/dev) and, per user, whether they can see compensation and personal data (Default/Visible/Blurred/Hidden).",
            "These sections are only visible to super-role users — everyone else sees this User Guide and nothing else on this page.",
        ],
        body_th: [
            "Gemini API Key — จำเป็นสำหรับ Key Insights, AI Talent Assessment และ OrgChart OCR upload ถ้าเว้นว่างไว้จะใช้ค่า default ของระบบแทน",
            "Companies & logos — สร้างบริษัทใหม่, อัปโหลด/crop โลโก้ (ลากปรับตำแหน่ง, เลื่อนซูม — กรอบตรงกับที่จะโชว์บน org chart จริง), และจัดการ office แต่ละประเทศของบริษัท (เพิ่ม/แก้/ลบ)",
            "Users & access — สร้าง login ใหม่, ตั้ง role ให้แต่ละคน (super/regular/dev) และตั้งได้เป็นรายคนว่าใครเห็นข้อมูลเงินเดือน/ข้อมูลส่วนตัวได้แค่ไหน (Default/Visible/Blurred/Hidden)",
            "ส่วนนี้เห็นได้เฉพาะ user ที่มี role เป็น super เท่านั้น — คนอื่นจะเห็นแค่คู่มือนี้ ไม่เห็นส่วนอื่นในหน้านี้",
        ],
    },
    {
        id: "roles",
        title_en: "Roles & Permissions",
        title_th: "สิทธิ์การใช้งาน",
        body_en: [
            "Three roles: super (sees everything, only role that can access Settings' admin sections), regular, dev.",
            "For regular/dev users, a super user sets per-person visibility for compensation and personal data (age/retirement): Default (role's baseline), Visible, Blurred (shown but obscured), or Hidden entirely.",
            "This is enforced on the server, not just hidden in the UI — a restricted user genuinely cannot retrieve that data, even by other means.",
        ],
        body_th: [
            "มี 3 role: super (เห็นทุกอย่าง เป็น role เดียวที่เข้าส่วน admin ของ Settings ได้), regular, dev",
            "สำหรับ regular/dev super user จะตั้งสิทธิ์การเห็นข้อมูลเงินเดือน/ข้อมูลส่วนตัว (อายุ/เกษียณ) ได้เป็นรายคน: Default (ตามค่าเริ่มต้นของ role), Visible, Blurred (เห็นแต่เบลอ), หรือ Hidden (ซ่อนทั้งหมด)",
            "การจำกัดสิทธิ์นี้บังคับใช้ที่ฝั่งเซิร์ฟเวอร์จริงๆ ไม่ใช่แค่ซ่อนหน้าจอ — user ที่ถูกจำกัดจะดึงข้อมูลนั้นออกมาไม่ได้จริงๆ ไม่ว่าจะพยายามด้วยวิธีไหน",
        ],
    },
];

export function UserGuide() {
    const [lang, setLang] = useState<"en" | "th">("en");
    const [openId, setOpenId] = useState<string | null>(SECTIONS[0].id);

    return (
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white">
                <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> User Guide · คู่มือการใช้งาน</span>
                <div className="flex rounded-md border border-white/20 p-0.5 text-[11.5px] font-medium">
                    <button
                        onClick={() => setLang("en")}
                        className={cn("rounded px-2.5 py-1 transition-colors", lang === "en" ? "bg-white text-[#0b1f3a]" : "text-white/70 hover:text-white")}
                    >
                        English
                    </button>
                    <button
                        onClick={() => setLang("th")}
                        className={cn("rounded px-2.5 py-1 transition-colors", lang === "th" ? "bg-white text-[#0b1f3a]" : "text-white/70 hover:text-white")}
                    >
                        ไทย
                    </button>
                </div>
            </div>
            <p className="border-b bg-slate-50 px-4 py-2 text-[12px] text-slate-500">
                {lang === "en"
                    ? "How each part of the app works, from creating an employee profile onward."
                    : "วิธีใช้งานแต่ละส่วนของระบบ ตั้งแต่การสร้างโปรไฟล์พนักงานเป็นต้นไป"}
            </p>
            <div className="divide-y">
                {SECTIONS.map((s) => {
                    const open = openId === s.id;
                    return (
                        <div key={s.id}>
                            <button
                                onClick={() => setOpenId(open ? null : s.id)}
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-semibold text-[#0f172a] hover:bg-slate-50 transition-colors"
                            >
                                {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                                {lang === "en" ? s.title_en : s.title_th}
                            </button>
                            {open && (
                                <div className="space-y-1.5 px-4 pb-3.5 pl-10 text-[12.5px] text-slate-600">
                                    {s.diagram && (
                                        <div className="mb-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                                            {s.diagram}
                                        </div>
                                    )}
                                    {(lang === "en" ? s.body_en : s.body_th).map((line, i) =>
                                        line.startsWith("= ") ? (
                                            <p key={i} className="my-1 rounded-md bg-[#0b1f3a]/[.05] px-3 py-1.5 font-mono text-[12px] font-medium text-[#0b1f3a]">{line}</p>
                                        ) : (
                                            <p key={i} className={line.startsWith("•") ? "pl-2 text-slate-500" : ""}>{line}</p>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
