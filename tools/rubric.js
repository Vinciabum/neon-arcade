// 게이트 3 — LLM 심사의 채점 규칙.
//
// 채점은 서브에이전트가 하지만 규칙은 여기서 강제한다.
// 특히 note(근거)를 필수로 두는 이유: 근거 없는 숫자는 검증할 수 없고,
// 검증할 수 없는 게이트는 통과시키기만 하는 장식이 된다.
//
// 이 게이트의 목적은 내부 품질 관리가 아니라 포털 심사 통과다 (설계 문서 5절).

export const RUBRIC = {
  AXES: [
    { key: 'responsiveness', max: 20, label: '조작 반응성', asks: '입력 지연, 관성·가속 처리가 자연스러운가' },
    { key: 'difficulty', max: 20, label: '난이도 곡선', asks: '초반 진입이 쉽고 상승이 합리적인가' },
    { key: 'visual', max: 20, label: '시각적 완성도', asks: '스크린샷이 상품으로 보이는가' },
    { key: 'session', max: 20, label: '세션 길이', asks: '킬링타임 1~3분 규격에 맞는가' },
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
