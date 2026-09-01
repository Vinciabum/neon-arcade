// 게이트 3 — LLM 심사의 채점 규칙.
//
// 채점은 서브에이전트가 하지만 규칙은 여기서 강제한다.
// 특히 note(근거)를 필수로 두는 이유: 근거 없는 숫자는 검증할 수 없고,
// 검증할 수 없는 게이트는 통과시키기만 하는 장식이 된다.
//
// 이 게이트의 목적은 포털 심사 통과와, 숏폼에서 손이 멈추는 화면인지 판정하는 것이다.
// 코지 게임은 하는 것이 재미있는 것으로 부족하고 보는 것이 만족스러워야 하므로,
// '손맛'과 '머무름'이 '난이도 곡선'과 '킬링타임 규격'을 대신한다. 뒤의 둘은 코지를
// 정확히 거꾸로 쟀다 — 이 게임은 길수록 좋고, 난이도 곡선이라는 것이 없다.

export const RUBRIC = {
  AXES: [
    { key: 'responsiveness', max: 20, label: '조작 반응성', asks: '두드림 하나하나가 즉시 반응하는가' },
    { key: 'satisfaction', max: 20, label: '손맛', asks: '아무것도 얻지 못해도 계속 두드리고 싶은가 — 보는 것과 듣는 것 자체가 보상인가' },
    { key: 'visual', max: 20, label: '시각적 완성도', asks: '200px 썸네일로 줄여도 상품으로 보이는가' },
    { key: 'dwell', max: 20, label: '머무름', asks: '3분 이상 머물 이유가 있는가. 빨리 끝나면 감점이다' },
    { key: 'distinctiveness', max: 20, label: '차별성', asks: '기존 게임과 메커니즘이 겹치지 않는가' }
  ],
  PASS: 70,
  MIN_NOTE: 30,     // 근거 최소 길이. "good" 같은 답을 막는다
  MAX_ATTEMPTS: 3   // 3회 실패하면 컨셉을 폐기한다
};

export function scoreCard(card) {
  const errors = [];
  let total = 0;

  for (const axis of RUBRIC.AXES) {
    const entry = card?.scores?.[axis.key];
    if (!entry) {
      errors.push(`${axis.key}: missing — every axis must be scored`);
      continue;
    }
    if (typeof entry.score !== 'number' || !Number.isFinite(entry.score)) {
      errors.push(`${axis.key}: score must be a number, got ${JSON.stringify(entry.score)}`);
    } else if (entry.score < 0 || entry.score > axis.max) {
      errors.push(`${axis.key}: score ${entry.score} outside 0-${axis.max}`);
    } else {
      total += entry.score;
    }
    const note = String(entry.note ?? '').trim();
    if (note.length < RUBRIC.MIN_NOTE) {
      errors.push(`${axis.key}: note is ${note.length} chars — under ${RUBRIC.MIN_NOTE} it is not evidence, it is a label`);
    }
  }

  // 규칙 위반이 있으면 합계는 의미가 없다. 통과도 실패도 아닌 무효다.
  const verdict = errors.length ? 'invalid' : (total >= RUBRIC.PASS ? 'pass' : 'regenerate');
  return { errors, total, verdict };
}
