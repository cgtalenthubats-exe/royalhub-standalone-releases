import { getSettingValue } from "@/app/actions/settings";

const MODEL = "gemini-3.1-flash-lite";

// Shared entry point for every AI-generation feature in the app (Key Insights,
// Proposal AI Assessment, ...). Reads the API key from the Settings page
// (app_settings table) with an env-var fallback, calls Gemini asking for a
// strict-JSON reply, and parses it defensively (models occasionally wrap JSON
// in prose/markdown fences even when asked not to).
export async function generateJson<T>(prompt: string, maxOutputTokens = 1200): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const apiKey = await getSettingValue("gemini_api_key");
    if (!apiKey) {
        return { ok: false, error: "Gemini API Key is not set. Add it on the Settings page to enable AI generation." };
    }

    try {
        const { GoogleGenAI } = await import("@google/genai");
        const client = new GoogleGenAI({ apiKey });
        const response = await client.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: { responseMimeType: "application/json", maxOutputTokens },
        });
        const text = response.text ?? "";
        // Find whichever bracket (object or array) opens first, and its matching
        // close — models sometimes wrap JSON in prose/markdown fences even when
        // told not to, so a naive first-"{"/last-"}" slice can start mid-array.
        const idxObj = text.indexOf("{"), idxArr = text.indexOf("[");
        const starts = [idxObj, idxArr].filter((i) => i !== -1);
        if (!starts.length) return { ok: false, error: "Gemini returned an empty response." };
        const start = Math.min(...starts);
        const end = text[start] === "[" ? text.lastIndexOf("]") : text.lastIndexOf("}");
        const jsonStr = text.slice(start, end + 1);
        if (!jsonStr) return { ok: false, error: "Gemini returned an empty response." };
        return { ok: true, data: JSON.parse(jsonStr) as T };
    } catch (e: any) {
        return { ok: false, error: extractErrorMessage(e) };
    }
}

// Multimodal sibling of generateJson — sends a file (image or PDF, as a base64
// blob) alongside the prompt, for anything that needs the model to actually
// look at a document rather than just read text (e.g. OrgChart OCR upload,
// see docs/ORGCHART_OCR_PLAN.md). Same key resolution, same defensive JSON
// parse, same error-message unwrapping as generateJson — only the request
// shape differs (an inlineData Part alongside the text Part, instead of a
// bare string).
export async function generateJsonFromFile<T>(
    prompt: string, fileBase64: string, mimeType: string, maxOutputTokens = 8000
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const apiKey = await getSettingValue("gemini_api_key");
    if (!apiKey) {
        return { ok: false, error: "Gemini API Key is not set. Add it on the Settings page to enable AI generation." };
    }

    try {
        const { GoogleGenAI } = await import("@google/genai");
        const client = new GoogleGenAI({ apiKey });
        const response = await client.models.generateContent({
            model: MODEL,
            contents: [{ text: prompt }, { inlineData: { mimeType, data: fileBase64 } }],
            config: { responseMimeType: "application/json", maxOutputTokens },
        });
        const text = response.text ?? "";
        const idxObj = text.indexOf("{"), idxArr = text.indexOf("[");
        const starts = [idxObj, idxArr].filter((i) => i !== -1);
        if (!starts.length) return { ok: false, error: "Gemini returned an empty response." };
        const start = Math.min(...starts);
        const end = text[start] === "[" ? text.lastIndexOf("]") : text.lastIndexOf("}");
        const jsonStr = text.slice(start, end + 1);
        if (!jsonStr) return { ok: false, error: "Gemini returned an empty response." };
        return { ok: true, data: JSON.parse(jsonStr) as T };
    } catch (e: any) {
        return { ok: false, error: extractErrorMessage(e) };
    }
}

// The Gemini SDK throws with `.message` set to the raw API error body (JSON
// text) rather than a plain string — surface just the human-readable part
// instead of dumping the whole payload into a toast.
function extractErrorMessage(e: any): string {
    const raw = e?.message || "AI generation failed";
    try {
        const parsed = JSON.parse(raw);
        return parsed?.error?.message || raw;
    } catch {
        return raw;
    }
}
