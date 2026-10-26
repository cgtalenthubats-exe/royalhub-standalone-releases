import { listDocuments } from "@/app/actions/documents";
import { listFolders } from "@/app/actions/document-folders";
import { DocumentationClient } from "./documentation-client";

export const dynamic = "force-dynamic";

export default async function DocumentationPage() {
    const [documents, folders] = await Promise.all([listDocuments(), listFolders(null)]);
    return (
        <div className="flex min-h-full lg:h-full flex-col px-4 sm:px-7 pt-[22px] pb-[18px]">
            <DocumentationClient documents={documents} folders={folders} />
        </div>
    );
}
