// Small hand-authored SVG illustrations for the User Guide — not screenshots
// of the running app (this environment can't capture those), diagrams of the
// flows/formulas instead. Box labels that name real on-screen UI elements
// (step names, section titles) are kept in English on purpose, matching what
// actually appears in the app regardless of which language the guide itself
// is set to — translating them would make the diagram harder to match to
// the real screen, not easier.
const NAVY = "#0b1f3a";
const GOLD = "#a16207";
const MUTED = "#94a3b8";
const LINE = "#cbd5e1";

function Box({ x, y, w, h, label, sub, fill = "#fff", stroke = NAVY, textColor = NAVY }: {
    x: number; y: number; w: number; h: number; label: string; sub?: string; fill?: string; stroke?: string; textColor?: string;
}) {
    return (
        <g>
            <rect x={x} y={y} width={w} height={h} rx={8} fill={fill} stroke={stroke} strokeWidth={1.25} />
            <text x={x + w / 2} y={y + h / 2 + (sub ? -3 : 4)} textAnchor="middle" fontSize={11} fontWeight={700} fill={textColor}>{label}</text>
            {sub && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize={9} fill={MUTED}>{sub}</text>}
        </g>
    );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE} strokeWidth={2} markerEnd="url(#arrow)" />;
}

function ArrowDefs() {
    return (
        <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={LINE} />
            </marker>
        </defs>
    );
}

export function WizardStepsDiagram() {
    const steps = ["Personal &\nEmployment", "Compensation\n& Benefits", "Compensation\nHistory", "Career\nHistory", "Background &\nRésumé", "Review"];
    const w = 92, gap = 14, h = 46, y = 20;
    return (
        <svg viewBox={`0 0 700 90`} className="w-full max-w-[640px]">
            <ArrowDefs />
            {steps.map((s, i) => {
                const x = i * (w + gap) + 8;
                const lines = s.split("\n");
                const last = i === steps.length - 1;
                return (
                    <g key={s}>
                        <rect x={x} y={y} width={w} height={h} rx={8} fill={last ? NAVY : "#fff"} stroke={NAVY} strokeWidth={1.25} />
                        {lines.map((line, li) => (
                            <text key={li} x={x + w / 2} y={y + h / 2 + (li - (lines.length - 1) / 2) * 11 + 3} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={last ? "#fff" : NAVY}>{line}</text>
                        ))}
                        {!last && <Arrow x1={x + w} y1={y + h / 2} x2={x + w + gap} y2={y + h / 2} />}
                    </g>
                );
            })}
        </svg>
    );
}

export function TotalCompDiagram() {
    return (
        <svg viewBox="0 0 620 140" className="w-full max-w-[560px]">
            <Box x={0} y={10} w={110} h={40} label="Base Salary" fill="#ecfdf5" stroke="#059669" textColor="#059669" />
            <text x={122} y={35} fontSize={16} fontWeight={700} fill={MUTED}>+</text>
            <Box x={136} y={10} w={110} h={40} label="STI Target (€)" fill="#ecfdf5" stroke="#059669" textColor="#059669" />
            <text x={258} y={35} fontSize={16} fontWeight={700} fill={MUTED}>+</text>
            <Box x={272} y={10} w={110} h={40} label="LTI Target (€)" fill="#ecfdf5" stroke="#059669" textColor="#059669" />
            <text x={394} y={35} fontSize={16} fontWeight={700} fill={MUTED}>+</text>
            <Box x={408} y={10} w={110} h={40} label="Other Bonus" fill="#ecfdf5" stroke="#059669" textColor="#059669" />
            <text x={528} y={35} fontSize={16} fontWeight={700} fill={MUTED}>=</text>
            <Box x={542} y={4} w={72} h={52} label="Total" sub="Comp" fill={NAVY} stroke={NAVY} textColor="#fff" />

            <text x={0} y={78} fontSize={10} fontWeight={700} fill="#dc2626">Not included:</text>
            <Box x={0} y={86} w={130} h={30} label="Allowances" sub="Car / Mobile / Housing / Medical" fill="#fef2f2" stroke="#fca5a5" textColor="#b91c1c" />
            <Box x={140} y={86} w={90} h={30} label="STI Max" fill="#fef2f2" stroke="#fca5a5" textColor="#b91c1c" />
            <Box x={240} y={86} w={90} h={30} label="LTI Max" fill="#fef2f2" stroke="#fca5a5" textColor="#b91c1c" />
        </svg>
    );
}

export function ReviewFlowDiagram({ steps }: { steps: string[] }) {
    const w = 130, gap = 18, h = 40, y = 15;
    return (
        <svg viewBox={`0 0 ${steps.length * (w + gap)} 75`} className="w-full max-w-[640px]">
            <ArrowDefs />
            {steps.map((s, i) => {
                const x = i * (w + gap);
                const last = i === steps.length - 1;
                return (
                    <g key={s}>
                        <Box x={x} y={y} w={w} h={h} label={s} fill={last ? NAVY : "#fff"} stroke={NAVY} textColor={last ? "#fff" : NAVY} />
                        {!last && <Arrow x1={x + w} y1={y + h / 2} x2={x + w + gap} y2={y + h / 2} />}
                    </g>
                );
            })}
        </svg>
    );
}

export function OrgDimensionsDiagram() {
    const cols = [
        { title: "Banner", sub: "real company\nreporting line", color: NAVY },
        { title: "Function", sub: "each company's\nown HR/Finance/etc.", color: "#0f6b5c" },
        { title: "Headcount", sub: "FTE\nrollup", color: GOLD },
    ];
    return (
        <svg viewBox="0 0 560 130" className="w-full max-w-[520px]">
            {cols.map((c, i) => {
                const cx = i * 190 + 20;
                return (
                    <g key={c.title}>
                        <text x={cx + 55} y={14} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={c.color}>{c.title}</text>
                        <rect x={cx + 25} y={22} width={60} height={26} rx={6} fill={c.color} />
                        <text x={cx + 55} y={39} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">You</text>
                        <line x1={cx + 55} y1={48} x2={cx + 15} y2={68} stroke={LINE} strokeWidth={1.5} />
                        <line x1={cx + 55} y1={48} x2={cx + 95} y2={68} stroke={LINE} strokeWidth={1.5} />
                        <rect x={cx} y={68} width={34} height={22} rx={5} fill="#fff" stroke={c.color} strokeWidth={1.25} />
                        <rect x={cx + 76} y={68} width={34} height={22} rx={5} fill="#fff" stroke={c.color} strokeWidth={1.25} />
                        {c.sub.split("\n").map((line, li) => (
                            <text key={li} x={cx + 55} y={104 + li * 11} textAnchor="middle" fontSize={8.5} fill={MUTED}>{line}</text>
                        ))}
                    </g>
                );
            })}
        </svg>
    );
}
