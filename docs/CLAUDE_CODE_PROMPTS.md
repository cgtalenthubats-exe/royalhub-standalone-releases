# RoyalFlush ATS — Claude Code Implementation Prompts

ใช้ prompt ทีละอันตามลำดับใน Claude Code (VS Code)
เปลี่ยนแปลงจาก original: วาง `RoyalFlush ATS.dc.html` ไว้ที่ `docs/design/royalflush-ats.html` ก่อนเริ่ม

---

## บริบท (วางไว้ครั้งแรก / อ้างอิงทุก prompt)

```
Context สำหรับงานนี้ทั้งหมด:
- อ่าน design อ้างอิงที่ docs/design/royalflush-ats.html (เปิดในเบราว์เซอร์ดู layout และแต่ละหน้าได้)
- ยึด docs/STACK.md + docs/PAGE_DATA_MAP.md + docs/SCHEMA.md เป็นแหล่งความจริงเรื่อง
  table / column / server action — ห้ามเดา field เอง
- ใช้ shadcn/ui + Tailwind ที่มีอยู่แล้วใน src/components/ui/ เท่านั้น ห้ามเพิ่ม UI library ใหม่
- Brand: navy #0b1f3a (top nav, card header bar, table thead, primary button, heading),
  amber-400/500 (logo crown, HQ badge, highlight), bg slate-50, card white, border slate-200,
  radius 0.75rem. ใช้ Tailwind tokens (bg-background, bg-card, text-muted-foreground) ที่ map ไว้แล้ว
- design ใช้ inline style → ให้ "แปลงเป็น Tailwind classes + แยกเป็น component ย่อย" ไม่ copy style ตรง
- เป้าหมาย layout: landscape tablet (1024–1366px) — ลด scroll ให้น้อยที่สุด ใช้แบบ 1 หน้าจอต่อ 1 view
  ไม่ได้ต้อง position:fixed ทุกที่ แต่ให้ออกแบบให้ข้อมูลหลักอยู่ครบใน viewport โดยไม่ต้อง scroll down
- ใช้ format helper ใน src/lib/format.ts (formatCurrency, formatDate, formatYears, gradeColor)
- ทำทีละหน้า ทดสอบก่อนค่อยไปหน้าถัดไป
```

---

## 0. Layout + Top Nav + Font (ทำก่อน)

```
เป้าหมาย: ติดตั้ง Plus Jakarta Sans + restructure layout ให้รองรับ 1-page landscape view

1. ติดตั้ง font: เพิ่ม next/font/google (Plus Jakarta Sans) ใน src/app/layout.tsx
   apply เป็น className บน <html> หรือ <body> และ update tailwind.config.js fontFamily.sans

2. Layout structure (src/app/layout.tsx):
   - ทั้งหน้าจอ: flex-col, h-screen, overflow-hidden
   - top nav (AppNav): fixed height ~56px
   - main content: flex-1, min-h-0, overflow-y-auto (scroll เฉพาะส่วน content)
   โดยรวมให้ nav ไม่หาย แต่ content เลื่อนได้ถ้าจำเป็น

3. src/components/app-nav.tsx:
   - ตาม design: navy #0b1f3a, สูง 56px, logo crown amber "ROYAL FLUSH" + badge "1.0 beta"
   - เมนู: Employees / Positions / Comparison / Org · By Banner / Org · By Function
   - search box + avatar ขวาสุด; active state = bg white/15 text-white, inactive = text-white/60
   - อ่าน app-nav.tsx ที่มีอยู่แล้ว แล้ว update ตาม design — ไม่ต้องเขียนใหม่ทั้งหมด
```

---

## 1. Home — Executive Overview (`src/app/page.tsx`)

```
Implement src/app/page.tsx ตามหน้า "Executive Overview" ใน design:

Layout (landscape, ไม่ scroll):
- header row: ชื่อ "Executive Overview" + subtitle + last synced
- KPI row 4 ใบ (grid-cols-4): Active Employees / Avg Total Comp / Banners / Functions
  ข้อมูลจาก server actions: listEmployees, getBannerSummary, getFunctionSummary (ดู PAGE_DATA_MAP หน้า /)
- lower section (grid-cols เหมาะสม, flex-1):
  - panel ซ้าย "Global Presence": react-simple-maps ComposableMap ที่มีอยู่แล้ว (src/components/world-map.tsx)
    ให้ดู component เดิมและปรับ styling ให้เข้ากับ design ใหม่ — ไม่ต้องเขียน SVG ใหม่
  - panel ขวา (stack 2 cards):
    - "Headcount by Function" bar list (data จาก getFunctionSummary)
    - "Readiness Pipeline" 3 ตัวเลข High/Medium/Low (data จาก listEmployees → นับ readiness_potential)

ทุกตัวเลขมาจาก DB จริง ห้าม hardcode
```

---

## 2. Employees — list + toolbar (`src/app/employees/page.tsx`)

```
Implement หน้า Employees ตาม design:

Layout (landscape, content เลื่อนได้ใน table area เท่านั้น):
- header + toolbar: Add Employee / Import / Export CSV
- filter bar: search + All Banners + All Functions + Status dropdown
- ตาราง (shadcn Table) thead navy: Employee(avatar+name) / Position / Country / Grade chip (Exec|Manager|IC) /
  Total Comp / FY25 grade badge / Team (direct reports) + Status
- คลิกแถว → /employees/[id]; resigned row แสดง opacity ลด

server actions: listEmployees, listPositions, getBannerSummary
columns ตาม PAGE_DATA_MAP หน้า /employees:
  total_comp จาก employee_compensation, latest grade จาก performance_grades,
  team จาก org_edges dimension=banner

อ่าน employee-table.tsx และ employee-toolbar.tsx ที่มีอยู่แล้วก่อน — update แทนเขียนใหม่
```

---

## 3. Employee Profile (`src/app/employees/[id]/page.tsx`) — หน้าหลัก

```
Implement Employee Profile ตาม design (landscape, ลด scroll ให้น้อยที่สุด):

Layout:
- header: back button + ชื่อหน้า + Export Profile / Edit buttons
- hero strip (grid 6 cols): [photo+name+banner+badges | Total Comp | Years of Service | FY Grade | Direct Reports | Readiness]
- lower grid 4 cols:
  (1) Personal & Employment (ตาราง field/value)
  (2) Compensation & Benefits (navy total row ล่างสุด)
  (3) Performance 5 ปี (grade badge สีตาม gradeColor) + Org Snapshot (manager → self → reports)
  (4) Key Insights (Top Performer / Leadership Potential / Talent Status cards)
- footer "Confidential – For Internal Use Only"

server action: getEmployee — ดึงข้อมูลครั้งเดียว ครบทุก field
อ่าน page.tsx เดิมก่อน แล้ว refactor ตาม design ใหม่

หลัง implement เสร็จให้ extract: SectionCard, StatCard, GradeBadge เป็น component กลางใน
src/components/ เพื่อให้หน้าอื่นใช้ร่วมได้
```

---

## 4. Positions & Requirements (`src/app/positions/page.tsx`)

```
Implement Positions & Requirements ตาม design:

Layout (landscape, scroll ใน card grid):
- header + "Add Position" button
- subtitle: "Competency targets per role – scored 1 to 10"
- grid การ์ดต่อ position: title + function chip + headcount (filled)
  bar 4 เส้น: Leadership / Experience / Skill / Market (req_* 1–10) สีตามระดับ
- ปุ่ม Edit/ลบ ต่อการ์ด + dialog Add/Edit

server actions: listPositions, createPosition, updatePosition, deletePosition, getFunctionSummary
อ่าน positions-client.tsx ที่มีอยู่แล้วก่อน — update ตาม design ใหม่
```

---

## 5. Comparison (`src/app/comparison/`)

```
Implement Employee Comparison ตาม design:

Layout (landscape, fixed-height grid, ไม่ scroll):
- header + "Add Employee" picker + "Export PPTX" button
- subtitle: "X of 5 slots"
- layout grid: label column ซ้าย (fixed width) + employee columns (dynamic, 1–5 คน)
  rows: employee header (avatar + name + position + country/function)
        Base Salary / STI Target / LTI Target / Other Bonus
        Total Comp row (with bar indicator) / FY2025 Grade / Direct Reports / Tenure
- what-if column (adjusted): client-side เท่านั้น ไม่เขียน DB
- Export PPTX ใช้ exportComparisonPptx ที่มีอยู่ใน src/lib/pptx-export.ts

server actions: listEmployees (picker), getEmployee per selected id
อ่าน comparison-client.tsx ที่มีอยู่แล้วก่อน — ปรับ layout ตาม design ใหม่
```

---

## 6. Org Charts (`src/app/org/banner/` และ `src/app/org/function/`)

```
Implement Org Structure pages (2 dimensions) ตาม design:

สำคัญ: ห้ามเปลี่ยน OrgChartD3 component (src/components/org-chart-d3.tsx)
ให้คง d3-org-chart ไว้ทั้งหมด (drag-drop reassign, zoom, PPTX export ต้องใช้งานได้)
ปรับแค่ layout ของ PAGE ที่ wrap OrgChartD3 เท่านั้น

Layout (landscape):
- header: ชื่อหน้า + subtitle + Export PPTX button + Switch to Function/Banner button
- main area (grid-cols 2 หรือ flex):
  - ซ้าย (flex-1): Card ครอบ OrgChartD3 (ความสูงให้เหมาะกับ viewport, เช่น h-[calc(100vh-200px)])
  - ขวา (fixed width ~300px): KPI card (total headcount) + Summary table scroll ได้
    - banner page: Branch Summary (country, tag HQ/Regional, head name, headcount)
    - function page: Function Summary (function name, head name, headcount)

server actions:
  - banner: getOrgFlat('banner'), getBannerSummary
  - function: getOrgFlat('function'), getFunctionSummary
  moveEmployee ถูก call โดย OrgChartD3 อยู่แล้ว ไม่ต้องแก้

อ่าน page.tsx ทั้ง 2 หน้าก่อน แล้ว update layout เท่านั้น
```

---

## ลำดับแนะนำ

1. **Prompt 0** (font + layout + nav) — foundation ของทุกหน้า
2. **Prompt 3** (Profile) — สร้าง SectionCard/StatCard/GradeBadge pattern ก่อน หน้าอื่นหยิบไปใช้
3. **Prompt 1** (Home) → **Prompt 2** (Employees) → **Prompt 4** (Positions) → **Prompt 5** (Comparison) → **Prompt 6** (Org)

ถ้า scroll ยังมีในบางหน้า ให้พิจารณา:
- ลด density (font-size เล็กลงนิด, padding ลด)
- แยก section เป็น Tabs แทน scroll ลง
- ให้ overflow-y-auto เฉพาะ section ย่อย (เช่น table body) ไม่ใช่ทั้งหน้า
