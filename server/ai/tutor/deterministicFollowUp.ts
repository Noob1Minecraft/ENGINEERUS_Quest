import type { SupportedLanguage } from '../languagePolicy';
import type { PersistedChatMessage } from '../../persistence/chats';
import { isStandardsLookupWarranted } from '../../standards/standardsPolicy';
import { verifyCalculations, type TutorDraft } from './verifier';
import {
  findTutorAnchor,
  hasCandidateAnswer,
  isArithmeticOnlyTutorStep,
  isFormulaOnlyTutorStep,
  isShortTutorResult,
} from './taskRouter';

const FORMULA = /^\s*([uir])\s*=\s*([uir](?:\s*(?:\*|×)\s*)?[uir]|[uir]\s*\/\s*[uir])\s*[.!?？]*\s*$/iu;
const ARITHMETIC = /^\s*([-+−]?\d+(?:[.,]\d+)?)\s*([+\-−*/×])\s*([-+−]?\d+(?:[.,]\d+)?)\s*=\s*([-+−]?\d+(?:[.,]\d+)?)\s*[.!?？]*\s*$/u;

const FORMULA_RESPONSES: Record<SupportedLanguage, string> = {
  ru: 'Да, эта формула записана верно. Теперь подставь известные величины, сохрани единицы и выполни следующий шаг.',
  kk: 'Иә, бұл формула дұрыс жазылған. Енді белгілі шамаларды қойып, өлшем бірліктерін сақта да, келесі қадамды орында.',
  en: 'Yes, that formula is written correctly. Now substitute the known quantities, keep the units, and complete the next step.',
};

const ARITHMETIC_RESPONSES: Record<SupportedLanguage, string> = {
  ru: 'Да, арифметическое равенство верно. Теперь определи, какой физической величине соответствует результат, и укажи её единицу.',
  kk: 'Иә, арифметикалық теңдік дұрыс. Енді нәтиже қай физикалық шамаға сәйкес келетінін анықтап, оның өлшем бірлігін көрсет.',
  en: 'Yes, the arithmetic equality is correct. Now identify the physical quantity represented by the result and state its unit.',
};

type FollowUpKind = 'formula' | 'arithmetic';
type OhmSymbol = 'U' | 'I' | 'R';
type ParsedQuantity = { value: number; unit: string };
type ApprovedFormula = {
  target: OhmSymbol;
  operation: 'multiply' | 'divide';
  left: OhmSymbol;
  right: OhmSymbol;
};
type ArithmeticStep = {
  left: number;
  operation: 'add' | 'subtract' | 'multiply' | 'divide';
  right: number;
  result: number;
};

export type VerifiedCandidateEvidence = Readonly<{
  kind: 'ohm_law';
  anchorMessageId: string;
  formulaMessageId: string;
  arithmeticMessageId: string;
  target: OhmSymbol;
  candidate: Readonly<ParsedQuantity>;
  expectedResult: Readonly<ParsedQuantity>;
  calculation: TutorDraft['calculations'][number];
}>;

function normalizeNumber(value: string): number {
  return Number(value.replace('−', '-').replace(',', '.'));
}

function parseApprovedFormula(text: string): ApprovedFormula | undefined {
  const match = text.normalize('NFKC').match(FORMULA);
  if (!match) return undefined;
  const target = match[1].toUpperCase() as OhmSymbol;
  const right = match[2].replace(/\s+/gu, '').replace('×', '*').toUpperCase();
  if (target === 'U' && ['I*R', 'IR'].includes(right)) {
    return { target, operation: 'multiply', left: 'I', right: 'R' };
  }
  if (target === 'U' && ['R*I', 'RI'].includes(right)) {
    return { target, operation: 'multiply', left: 'R', right: 'I' };
  }
  if (target === 'I' && right === 'U/R') return { target, operation: 'divide', left: 'U', right: 'R' };
  if (target === 'R' && right === 'U/I') return { target, operation: 'divide', left: 'U', right: 'I' };
  return undefined;
}

function formulaIsWhitelisted(text: string): boolean {
  return parseApprovedFormula(text) !== undefined;
}

function parseArithmetic(text: string): ArithmeticStep | undefined {
  const match = text.normalize('NFKC').match(ARITHMETIC);
  if (!match) return undefined;
  const operations: Record<string, ArithmeticStep['operation']> = {
    '+': 'add', '-': 'subtract', '−': 'subtract', '*': 'multiply', '×': 'multiply', '/': 'divide',
  };
  return {
    left: normalizeNumber(match[1]), operation: operations[match[2]],
    right: normalizeNumber(match[3]), result: normalizeNumber(match[4]),
  };
}

function correctArithmetic(text: string): boolean {
  const parsed = parseArithmetic(text);
  if (!parsed) return false;
  const { left, operation, right, result: declared } = parsed;
  if (![left, right, declared].every(Number.isFinite)) return false;
  if (operation === 'divide' && right === 0) return false;
  const expected = operation === 'add' ? left + right
    : operation === 'subtract' ? left - right
      : operation === 'multiply' ? left * right : left / right;
  return Number.isFinite(expected)
    && Math.abs(expected - declared) <= 1e-9 * Math.max(Math.abs(expected), Math.abs(declared), 1);
}

function followUpKind(text: string): FollowUpKind | undefined {
  if (formulaIsWhitelisted(text)) return 'formula';
  if (ARITHMETIC.test(text.normalize('NFKC'))) return 'arithmetic';
  return undefined;
}

/** Used only to decide whether owner-scoped history should be loaded. */
export function isDeterministicTutorFollowUpCandidate(text: string): boolean {
  return followUpKind(text) !== undefined;
}

function hasUnambiguousOhmContext(text: string): boolean {
  const normalized = text.normalize('NFKC');
  const symbols = new Set((normalized.match(/(?:^|[^\p{L}])([UIR])(?=$|[^\p{L}])/giu) ?? [])
    .flatMap((part) => part.toUpperCase().match(/[UIR]/gu) ?? []));
  const electrical = /(?:Ω|Ω|Ohm|Ом|закон\s+ома|ohm['’]?s?\s+law|ом\s+заңы)/iu.test(normalized);
  return electrical && symbols.size === 3 && /(?:find|calculate|compute|найди|найти|вычисли|рассчитай|тап|есепте|=\s*\?)/iu.test(normalized);
}

export type DeterministicTutorFollowUpInput = {
  text: string;
  history: readonly PersistedChatMessage[];
  language: SupportedLanguage;
  explicitMode?: string;
  hasDocument: boolean;
  hasImages: boolean;
  hasStandards?: boolean;
};

const DETERMINISTIC_ACKNOWLEDGEMENTS = new Set([
  ...Object.values(FORMULA_RESPONSES), ...Object.values(ARITHMETIC_RESPONSES),
]);

const QUANTITY_ASSIGNMENT = /([UIR])\s*=\s*([-+−]?\d+(?:[.,]\d+)?)\s*(mA|A|А|V|В|kΩ|kΩ|Ω|Ω|кОм|Ом|kOhm|Ohm)(?=$|[^\p{L}\p{N}])/giu;
const CANDIDATE_RESULT = /^\s*(?:([UIR])\s*=\s*)?([-+−]?\d+(?:[.,]\d+)?)\s*(mA|A|А|V|В|kΩ|kΩ|Ω|Ω|кОм|Ом|kOhm|Ohm)\s*[.!?？]*\s*$/iu;

function normalizeOhmUnit(raw: string): string | undefined {
  if (raw === 'А' || raw.toLowerCase() === 'a') return 'A';
  if (raw.toLowerCase() === 'ma') return 'mA';
  if (raw === 'В' || raw.toLowerCase() === 'v') return 'V';
  if (['Ω', 'Ω', 'Ом'].includes(raw) || raw.toLowerCase() === 'ohm') return 'Ohm';
  if (['kΩ', 'kΩ', 'кОм'].includes(raw) || raw.toLowerCase() === 'kohm') return 'kOhm';
  return undefined;
}

function unitMatchesSymbol(symbol: OhmSymbol, unit: string): boolean {
  return symbol === 'U' ? unit === 'V'
    : symbol === 'I' ? unit === 'A' || unit === 'mA'
      : unit === 'Ohm' || unit === 'kOhm';
}

function requestedOhmTarget(text: string): OhmSymbol | undefined {
  const normalized = text.normalize('NFKC');
  const match = normalized.match(/(?:find|calculate|compute|найди|найти|вычисли|рассчитай|тап|есепте)\s+(?:the\s+)?(?:value\s+of\s+)?([UIR])(?=$|[^\p{L}])/iu)
    ?? normalized.match(/([UIR])\s*=\s*\?/iu);
  return match?.[1]?.toUpperCase() as OhmSymbol | undefined;
}

function parseOhmAnchor(text: string): { target: OhmSymbol; quantities: Map<OhmSymbol, ParsedQuantity> } | undefined {
  if (!hasUnambiguousOhmContext(text)) return undefined;
  const target = requestedOhmTarget(text);
  if (!target) return undefined;
  const quantities = new Map<OhmSymbol, ParsedQuantity>();
  const matches = [...text.normalize('NFKC').matchAll(QUANTITY_ASSIGNMENT)];
  if (matches.length !== 2) return undefined;
  for (const match of matches) {
    const symbol = match[1].toUpperCase() as OhmSymbol;
    const value = normalizeNumber(match[2]);
    const unit = normalizeOhmUnit(match[3]);
    if (!Number.isFinite(value) || !unit || !unitMatchesSymbol(symbol, unit) || quantities.has(symbol)) return undefined;
    quantities.set(symbol, { value, unit });
  }
  const expectedKnown = new Set<OhmSymbol>(['U', 'I', 'R'].filter((symbol) => symbol !== target) as OhmSymbol[]);
  if (quantities.has(target) || quantities.size !== expectedKnown.size
    || [...expectedKnown].some((symbol) => !quantities.has(symbol))) return undefined;
  return { target, quantities };
}

function parseCandidate(text: string, target: OhmSymbol): ParsedQuantity | undefined {
  const match = text.normalize('NFKC').match(CANDIDATE_RESULT);
  if (!match || (match[1] && match[1].toUpperCase() !== target)) return undefined;
  const value = normalizeNumber(match[2]);
  const unit = normalizeOhmUnit(match[3]);
  return Number.isFinite(value) && unit ? { value, unit } : undefined;
}

function expectedOhmResultUnit(target: OhmSymbol, right: ParsedQuantity): string {
  if (target === 'U') return 'V';
  if (target === 'I') return right.unit === 'kOhm' ? 'mA' : 'A';
  return right.unit === 'mA' ? 'kOhm' : 'Ohm';
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9 * Math.max(Math.abs(left), Math.abs(right), 1);
}

export function resolveVerifiedCandidateEvidence(
  input: DeterministicTutorFollowUpInput,
): VerifiedCandidateEvidence | undefined {
  if (input.explicitMode || input.hasDocument || input.hasImages || input.hasStandards
    || isStandardsLookupWarranted(input.text)) return undefined;
  const anchor = findTutorAnchor(input.history);
  if (!anchor || isStandardsLookupWarranted(anchor.text)) return undefined;
  const parsedAnchor = parseOhmAnchor(anchor.text);
  if (!parsedAnchor) return undefined;
  const candidate = parseCandidate(input.text, parsedAnchor.target);
  if (!candidate) return undefined;

  const anchorIndex = input.history.indexOf(anchor);
  const learnerSteps = input.history.slice(anchorIndex + 1)
    .filter((message) => message.module === 'tutor' && message.sender === 'user');
  if (learnerSteps.length < 2) return undefined;
  const formulaMessage = learnerSteps.at(-2)!;
  const arithmeticMessage = learnerSteps.at(-1)!;
  const formula = parseApprovedFormula(formulaMessage.text);
  const arithmetic = parseArithmetic(arithmeticMessage.text);
  if (!formula || formula.target !== parsedAnchor.target || !arithmetic || !correctArithmetic(arithmeticMessage.text)
    || formula.operation !== arithmetic.operation) return undefined;

  const left = parsedAnchor.quantities.get(formula.left);
  const right = parsedAnchor.quantities.get(formula.right);
  if (!left || !right) return undefined;
  const operandsMatch = formula.operation === 'multiply'
    ? (nearlyEqual(arithmetic.left, left.value) && nearlyEqual(arithmetic.right, right.value))
      || (nearlyEqual(arithmetic.left, right.value) && nearlyEqual(arithmetic.right, left.value))
    : nearlyEqual(arithmetic.left, left.value) && nearlyEqual(arithmetic.right, right.value);
  if (!operandsMatch) return undefined;

  const expectedResult = {
    value: arithmetic.result,
    unit: expectedOhmResultUnit(parsedAnchor.target, right),
  };
  const calculation: TutorDraft['calculations'][number] = {
    left, operation: formula.operation, right, result: expectedResult,
  };
  const checks = verifyCalculations([calculation]);
  if (checks.checked !== 1 || checks.issues.length !== 0) return undefined;
  return {
    kind: 'ohm_law', anchorMessageId: anchor.id,
    formulaMessageId: formulaMessage.id, arithmeticMessageId: arithmeticMessage.id,
    target: parsedAnchor.target, candidate, expectedResult, calculation,
  };
}

export function hasVerifiedTutorWorkContext(input: DeterministicTutorFollowUpInput): boolean {
  if (!isShortTutorResult(input.text) || input.explicitMode
    || input.hasDocument || input.hasImages || input.hasStandards) return false;
  const tutorHistory = input.history.filter((message) => message.module === 'tutor');
  const assistant = tutorHistory.at(-1);
  const learnerStep = tutorHistory.at(-2);
  if (!assistant || assistant.sender !== 'ai' || !DETERMINISTIC_ACKNOWLEDGEMENTS.has(assistant.text)) return false;
  if (!learnerStep || learnerStep.sender !== 'user'
    || !(formulaIsWhitelisted(learnerStep.text)
      || (isArithmeticOnlyTutorStep(learnerStep.text) && correctArithmetic(learnerStep.text)))) return false;
  const anchor = findTutorAnchor(input.history);
  return Boolean(anchor && hasUnambiguousOhmContext(anchor.text)
    && !isStandardsLookupWarranted(anchor.text) && !isStandardsLookupWarranted(input.text));
}

/**
 * Returns fixed text only for tightly bounded, owner-scoped follow-ups. Any
 * ambiguity deliberately falls through to the normal reviewed Tutor pipeline.
 */
export function resolveDeterministicTutorFollowUp(
  input: DeterministicTutorFollowUpInput,
): string | undefined {
  if (input.explicitMode || input.hasDocument || input.hasImages || input.hasStandards
    || hasCandidateAnswer(input.text)) return undefined;
  const kind = followUpKind(input.text);
  if (!kind || (kind === 'arithmetic' && !correctArithmetic(input.text))) return undefined;
  const anchor = findTutorAnchor(input.history);
  if (!anchor || isStandardsLookupWarranted(anchor.text) || isStandardsLookupWarranted(input.text)) return undefined;
  const anchorIndex = input.history.indexOf(anchor);
  const hasAssistantReply = input.history.slice(anchorIndex + 1)
    .some((message) => message.module === 'tutor' && message.sender === 'ai');
  if (!hasAssistantReply) return undefined;
  if (kind === 'formula' && !hasUnambiguousOhmContext(anchor.text)) return undefined;
  return kind === 'formula' ? FORMULA_RESPONSES[input.language] : ARITHMETIC_RESPONSES[input.language];
}
