const CLOSED_THINK_BLOCK = /<think(?:\s[^>]*)?>[\s\S]*?<\/think\s*>/giu;
const UNCLOSED_THINK_BLOCK = /<think(?:\s[^>]*)?>[\s\S]*$/giu;

export function sanitizeAssistantContent(content: string): string {
  return content
    .replace(CLOSED_THINK_BLOCK, "")
    .replace(UNCLOSED_THINK_BLOCK, "")
    .trim();
}
