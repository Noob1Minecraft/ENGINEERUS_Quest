import { z } from 'zod';
import { sanitizeAssistantContent } from '../responseSafety';

// SI dimensions: mass, length, time, current. Deliberately small, explicit scope.
const units = {
  '1': [1, [0, 0, 0, 0]], m: [1, [0, 1, 0, 0]], mm: [0.001, [0, 1, 0, 0]],
  s: [1, [0, 0, 1, 0]], kg: [1, [1, 0, 0, 0]], N: [1, [1, 1, -2, 0]],
  A: [1, [0, 0, 0, 1]], mA: [0.001, [0, 0, 0, 1]],
  V: [1, [1, 2, -3, -1]], Ohm: [1, [1, 2, -3, -2]], kOhm: [1000, [1, 2, -3, -2]],
  W: [1, [1, 2, -3, 0]], Pa: [1, [1, -1, -2, 0]], MPa: [1e6, [1, -1, -2, 0]],
} satisfies Record<string, [number, number[]]>;
const quantity = z.object({ value: z.number().finite(), unit: z.string().max(12) }).strict();
const calculation = z.object({
  left: quantity, operation: z.enum(['add', 'subtract', 'multiply', 'divide']), right: quantity, result: quantity,
}).strict();
const draftSchema = z.object({
  response: z.string().trim().min(1).max(14_000),
  calculations: z.array(calculation).max(12),
  revealsFinalAnswer: z.boolean(),
  uncertain: z.boolean(),
}).strict();
export type TutorDraft = z.infer<typeof draftSchema>;

export function parseTutorDraft(raw: string): TutorDraft | undefined {
  try {
    const json = sanitizeAssistantContent(raw).replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
    const result = draftSchema.safeParse(JSON.parse(json));
    if (!result.success) return undefined;
    const response = sanitizeAssistantContent(result.data.response);
    return response ? { ...result.data, response } : undefined;
  } catch { return undefined; }
}

export function verifyCalculations(calculations: TutorDraft['calculations']): { checked: number; issues: string[] } {
  let checked = 0;
  const issues: string[] = [];
  calculations.forEach((item, index) => {
    const left = units[item.left.unit as keyof typeof units];
    const right = units[item.right.unit as keyof typeof units];
    const result = units[item.result.unit as keyof typeof units];
    if (!left || !right || !result) { issues.push(`check ${index}: unsupported unit; not verified`); return; }
    const additive = item.operation === 'add' || item.operation === 'subtract';
    const dimensions = additive ? left[1] : left[1].map((value, i) => value + right[1][i] * (item.operation === 'divide' ? -1 : 1));
    if ((additive && left[1].some((value, i) => value !== right[1][i]))
        || dimensions.some((value, i) => value !== result[1][i])) {
      issues.push(`check ${index}: dimensional mismatch`); return;
    }
    const a = item.left.value * left[0], b = item.right.value * right[0];
    const expected = item.operation === 'add' ? a + b : item.operation === 'subtract' ? a - b
      : item.operation === 'multiply' ? a * b : a / b;
    const actual = item.result.value * result[0];
    if (!Number.isFinite(expected) || !Number.isFinite(actual)
        || Math.abs(expected - actual) > 1e-6 * Math.max(Math.abs(expected), Math.abs(actual), 1e-12)) {
      issues.push(`check ${index}: arithmetic mismatch or undefined result`); return;
    }
    checked += 1;
  });
  return { checked, issues };
}
