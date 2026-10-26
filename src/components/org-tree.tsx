import Link from "next/link";
import type { OrgNode } from "@/app/actions/org";
import { EmployeeAvatar } from "@/components/employee-avatar";

// Recursive CSS org tree (canonical pure-CSS connector pattern).
export function OrgTree({ roots }: { roots: OrgNode[] }) {
    if (!roots.length) return <div className="p-6 text-sm text-muted-foreground">No org data</div>;
    return (
        <div className="overflow-x-auto p-6">
            <div className="tree inline-block min-w-full text-center">
                <ul>
                    {roots.map((n) => <TreeNode key={n.employee_id} node={n} />)}
                </ul>
            </div>
            <style>{css}</style>
        </div>
    );
}

function TreeNode({ node }: { node: OrgNode }) {
    return (
        <li>
            <Link href={`/employees/${node.employee_id}`} className="tree-card">
                <EmployeeAvatar name={node.name} photo={node.photo} size={36} className="mx-auto mb-1" />
                <span className="tree-name">{node.name}</span>
                <span className="tree-pos">{node.position_title}</span>
                <span className="tree-meta">{(node.banner_name || node.function_name) ?? ""}{node.country ? ` · ${node.country}` : ""}</span>
            </Link>
            {node.children.length > 0 && (
                <ul>{node.children.map((c) => <TreeNode key={c.employee_id} node={c} />)}</ul>
            )}
        </li>
    );
}

const css = `
.tree ul { position: relative; padding: 22px 0 0; display: flex; justify-content: center; gap: 0; }
.tree li { position: relative; list-style: none; padding: 22px 10px 0; }
.tree li::before, .tree li::after {
  content: ''; position: absolute; top: 0; right: 50%;
  border-top: 2px solid #cbd5e1; width: 50%; height: 22px;
}
.tree li::after { right: auto; left: 50%; border-left: 2px solid #cbd5e1; }
.tree li:only-child::after, .tree li:only-child::before { display: none; }
.tree li:only-child { padding-top: 22px; }
.tree li:first-child::before, .tree li:last-child::after { border: 0 none; }
.tree li:last-child::before { border-right: 2px solid #cbd5e1; border-radius: 0 6px 0 0; }
.tree li:first-child::after { border-radius: 6px 0 0 0; }
.tree ul ul::before {
  content: ''; position: absolute; top: 0; left: 50%;
  border-left: 2px solid #cbd5e1; width: 0; height: 22px;
}
.tree > ul { padding-top: 0; }
.tree > ul > li { padding-top: 0; }
.tree > ul > li::before, .tree > ul > li::after { display: none; }
.tree-card {
  display: inline-flex; flex-direction: column; align-items: center; min-width: 150px; max-width: 190px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px;
  text-decoration: none; box-shadow: 0 1px 2px rgba(0,0,0,.05); transition: box-shadow .15s, border-color .15s;
}
.tree-card:hover { box-shadow: 0 4px 10px rgba(11,31,58,.15); border-color: #0b1f3a; }
.tree-name { font-weight: 600; font-size: 13px; color: #0b1f3a; }
.tree-pos { font-size: 11px; color: #475569; }
.tree-meta { font-size: 9px; color: #94a3b8; margin-top: 2px; }
`;
