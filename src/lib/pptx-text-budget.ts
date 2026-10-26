// Soft character guidance for free-text fields that end up on the native
// ICPD PPTX export (src/lib/pptx-export.ts) — a slide can't scroll the way
// the on-screen card can, so a field that's comfortable to type here can
// still overflow or shrink unreadably small there. These numbers are
// estimates (box width/height ÷ an average 0.52em character width at the
// export's actual font size), calibrated against real seeded content, not a
// hard limit — nothing here blocks typing, same as every other soft guard
// in this app's forms.
//
// Recalculate if a panel's size, font size, or row cap changes in
// pptx-export.ts — each budget is tied to one specific box there.
export interface TextBudget {
    max: number;
    note: string;
}

export const PPTX_TEXT_BUDGET = {
    // Background card, Strength / Development Area entries — shared box per
    // side (1.68in wide), fit:"shrink" font starting at 8pt. Budget is the
    // TOTAL across every entry of that type, not per entry — more entries
    // means less room each before the panel starts shrinking the font.
    backgroundStrength: { max: 230, note: "~230 characters total across all Strength entries before the PPTX export starts shrinking the text" } as TextBudget,
    backgroundDevelopmentArea: { max: 230, note: "~230 characters total across all Development Area entries before the PPTX export starts shrinking the text" } as TextBudget,

    // Leadership Competencies bullet list — full-width box, fit:"shrink" at 9pt.
    competencyName: { max: 360, note: "~360 characters total across all competencies listed before the PPTX export starts shrinking the text" } as TextBudget,

    // Achievements bullet list — full-width box, fit:"shrink" at 8.5pt.
    achievementDescription: { max: 250, note: "~250 characters total across all achievements before the PPTX export starts shrinking the text" } as TextBudget,

    // Action Plan table (slide 1) — fixed 8pt font, no shrink, only 2 rows of
    // real vertical room. Kept deliberately tight so a row never wraps to a
    // second line and spills into the panel below it.
    actionPlanField: { max: 40, note: "~40 characters — keeps this on one line in the PPTX export" } as TextBudget,

    // Preparation to Support Next Roles table (slide 2) — same fields,
    // much roomier box (1.7in tall, only 3 rows).
    nextRolePrepField: { max: 110, note: "~110 characters — fits comfortably in the PPTX export" } as TextBudget,

    // Career Planning table (slide 2) — Destination Role column, fixed 8pt.
    destinationRole: { max: 44, note: "~44 characters — keeps this on one line in the PPTX export" } as TextBudget,
} as const;
