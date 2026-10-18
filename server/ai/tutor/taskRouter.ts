import type { PersistedChatMessage } from '../../persistence/chats';

export const TUTOR_MODES = ['hint', 'step_by_step', 'full_explanation', 'check_my_solution', 'quiz_me'] as const;
export type TutorMode = typeof TUTOR_MODES[number];
export type TaskCategory = 'theory' | 'calculation' | 'formula' | 'troubleshooting' | 'mechanics'
  | 'electronics' | 'programming' | 'cad_design' | 'laboratory' | 'other_engineering';
export type LearningContext = {
  category: TaskCategory;
  difficulty: 'unknown';
  hintLevel: 0 | 1 | 2 | 3;
  neededFullExplanation: boolean;
  submittedSolution: boolean;
};
export type TutorPlan = LearningContext & { mode: TutorMode; followUp: boolean };

const MORE = /(?:i\s+(?:still\s+)?(?:don['’]?t|do not)\s+understand|explain\s+(?:more|simpler)|не\s+понимаю|объясни\s+(?:подробнее|проще)|түсінбедім|түсінбеймін|толығырақ\s+түсіндір)/iu;
const FULL = /(?:show\s+(?:the\s+)?full\s+(?:solution|explanation)|give\s+(?:the\s+)?(?:full\s+)?answer|полное\s+решение|реши\s+полностью|покажи\s+(?:решение|ответ)|толық\s+(?:шешім|шешу|түсіндір)|жауабын\s+көрсет)/iu;
const CHECK = /(?:check\s+my\s+(?:answer|solution|work)|проверь\s+(?:мо[йёею]\s+)?(?:решение|ответ)|(?:шешімімді|жауабымды)\s+тексер)/iu;
const QUIZ = /(?:quiz\s+me|test\s+my\s+knowledge|проверь\s+мои\s+знания|задай\s+(?:мне\s+)?вопрос|мені\s+сына|білімімді\s+тексер)/iu;
const HINT = /(?:give\s+(?:me\s+)?(?:a\s+)?hint|подсказ|кеңес\s+бер|ишара)/iu;
const STEPS = /(?:step[ -]by[ -]step|пошагов|қадамдап)/iu;

export function isTutorFollowUp(text: string): boolean {
  return MORE.test(text) || FULL.test(text) || CHECK.test(text) || QUIZ.test(text) || HINT.test(text) || STEPS.test(text);
}

function isStandaloneControl(text: string): boolean {
  return /^(?:please\s+)?(?:i\s+(?:still\s+)?(?:don['’]?t|do not)\s+understand|explain\s+(?:more|simpler)|show\s+(?:the\s+)?full\s+(?:solution|explanation)|give\s+(?:me\s+)?(?:a\s+)?hint|check\s+my\s+(?:answer|solution|work)|quiz\s+me|step[ -]by[ -]step|не\s+понимаю|объясни\s+(?:подробнее|проще)|покажи\s+(?:полное\s+)?(?:решение|ответ)|реши\s+полностью|дай\s+подсказку|проверь\s+(?:мо[йёею]\s+)?(?:решение|ответ)|түсінбедім|түсінбеймін|толығырақ\s+түсіндір|толық\s+шешім|ишара|қадамдап|мені\s+сына)\s*[.!?]*$/iu.test(text.trim());
}

export function routeTutorTask(text: string): TaskCategory {
  if (/(?:calculate|compute|solve|find\s+the|рассчитай|вычисли|найди|реши|есепте|\d+\s*(?:V|A|Ω|Ohm|kg|N|В|Ом|Н)\b)/iu.test(text)) return 'calculation';
  if (/(?:formula|формул|теңдеу)/iu.test(text)) return 'formula';
  if (/(?:diagnos|troubleshoot|not working|debug|не работает|диагност|ақау)/iu.test(text)) return 'troubleshooting';
  if (/(?:laborator|lab\s+prep|лаборатор|зертхана)/iu.test(text)) return 'laboratory';
  if (/(?:cad|design|черт[её]ж|проектир|сызба|жобалау)/iu.test(text)) return 'cad_design';
  if (/(?:program|code|embedded|arduino|python|код|бағдарлам)/iu.test(text)) return 'programming';
  if (/(?:circuit|electr|ohm|kirchhoff|электр|закон ома|кирхгоф|тізбек|кернеу)/iu.test(text)) return 'electronics';
  if (/(?:mechanic|beam|force|механик|балк|сил|арқалық|күш)/iu.test(text)) return 'mechanics';
  if (/(?:what|why|explain|theory|что|почему|объясни|теори|не деген|неге|түсіндір)/iu.test(text)) return 'theory';
  return 'other_engineering';
}

/** Reconstructed per request from owner-scoped history; no user profile or global cache. */
export function planTutoring(text: string, history: readonly PersistedChatMessage[], explicit?: TutorMode): TutorPlan {
  const users = history.filter((message) => message.sender === 'user' && message.module === 'tutor').slice(-4);
  // Only a short, stand-alone tutoring control inherits the prior task, not a new question.
  const standalone = isStandaloneControl(text);
  let anchorIndex = -1;
  users.forEach((message, index) => { if (!isStandaloneControl(message.text)) anchorIndex = index; });
  const category = standalone && anchorIndex >= 0 ? routeTutorTask(users[anchorIndex].text) : routeTutorTask(text);
  const completedFollowUps = standalone ? anchorIndex >= 0 ? users.length - anchorIndex - 1 : users.length : 0;
  let mode: TutorMode = explicit ?? (FULL.test(text) ? 'full_explanation'
    : CHECK.test(text) ? 'check_my_solution' : QUIZ.test(text) ? 'quiz_me'
      : STEPS.test(text) ? 'step_by_step' : HINT.test(text) || MORE.test(text) || category === 'calculation' ? 'hint' : 'full_explanation');
  let hintLevel: 0 | 1 | 2 | 3 = mode === 'hint' ? (MORE.test(text) || HINT.test(text)) && users.length > 0
    ? Math.min(3, completedFollowUps + 2) as 2 | 3 : 1 : mode === 'step_by_step' ? 3 : 0;
  if (!explicit && mode === 'hint' && MORE.test(text) && completedFollowUps >= 2) {
    mode = 'full_explanation'; hintLevel = 0;
  }
  return { category, mode, hintLevel, followUp: standalone, difficulty: 'unknown',
    neededFullExplanation: mode === 'full_explanation', submittedSolution: mode === 'check_my_solution' };
}
