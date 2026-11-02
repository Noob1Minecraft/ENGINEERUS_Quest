import type { SupportedLanguage } from '../languagePolicy';
import type { PersistedChatMessage } from '../../persistence/chats';
import { isStandardsLookupWarranted } from '../../standards/standardsPolicy';
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

function normalizeNumber(value: string): number {
  return Number(value.replace('−', '-').replace(',', '.'));
}

function formulaIsWhitelisted(text: string): boolean {
  const match = text.normalize('NFKC').match(FORMULA);
  if (!match) return false;
  const left = match[1].toUpperCase();
  const right = match[2].replace(/\s+/gu, '').replace('×', '*').toUpperCase();
  return (left === 'U' && ['I*R', 'IR', 'R*I', 'RI'].includes(right))
    || (left === 'I' && right === 'U/R')
    || (left === 'R' && right === 'U/I');
}

function correctArithmetic(text: string): boolean {
  const match = text.normalize('NFKC').match(ARITHMETIC);
  if (!match) return false;
  const left = normalizeNumber(match[1]);
  const right = normalizeNumber(match[3]);
  const declared = normalizeNumber(match[4]);
  if (![left, right, declared].every(Number.isFinite)) return false;
  const operation = match[2];
  if (operation === '/' && right === 0) return false;
  const expected = operation === '+' ? left + right
    : operation === '-' || operation === '−' ? left - right
      : operation === '*' || operation === '×' ? left * right : left / right;
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
