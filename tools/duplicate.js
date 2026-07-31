// 게이트 4 — 중복 방지.
//
// 설계 문서가 "scaled content abuse 방어의 실질적 핵심"이라고 부른 게이트다.
// 비슷비슷한 게임이 쌓이는 것이 개별 게임의 품질보다 위험하다.
//
// LLM을 쓰지 않는다. 계산으로 되는 판정을 LLM에 맡기면 같은 입력에 다른 답이 나오고,
// 그러면 "중복인가"라는 질문에 재현 가능한 답이 없어진다.
import { AXIS_NAMES } from './mechanics.js';

export const DUP = {
  REJECT_AT: 4,   // 네 축이 전부 같다 = 같은 게임이다
  WARN_AT: 3      // 셋이 같다 = 가깝다. 게이트 3의 차별성 항목이 판단한다
};

// 두 메커니즘에서 값이 같은 축의 이름을 준다.
export function matchedAxes(a, b) {
  return AXIS_NAMES.filter(axis => a?.[axis] !== undefined && a[axis] === b?.[axis]).sort();
}

// "neon-rise" -> "rise". 마지막 토큰이 그 게임의 명사다.
const nounOf = (slug) => String(slug).split('-').at(-1);

export function checkDuplicate(candidate, existing) {
  const reasons = [];
  let verdict = 'ok';

  for (const other of existing) {
    // 재심사할 때 자기 자신이 목록에 들어 있으면 항상 4축 일치가 된다.
    if (other.slug === candidate.slug) continue;

    // 명사 충돌은 메커니즘과 무관하게 거부한다.
    // 뱀 게임이 둘이면 메커니즘이 달라도 사용자에게는 뱀 게임 둘이다.
    if (nounOf(other.slug) === nounOf(candidate.slug)) {
      verdict = 'reject';
      reasons.push(`"${candidate.slug}" ends in the same noun as "${other.slug}" ("${nounOf(candidate.slug)}") — pick a different subject`);
      continue;
    }

    const axes = matchedAxes(candidate.mechanics, other.mechanics);
    if (axes.length >= DUP.REJECT_AT) {
      verdict = 'reject';
      reasons.push(`identical mechanics to "${other.slug}" on all ${axes.length} axes (${axes.join(', ')})`);
    } else if (axes.length >= DUP.WARN_AT) {
      if (verdict === 'ok') verdict = 'warn';
      reasons.push(`close to "${other.slug}" — ${axes.length} of ${AXIS_NAMES.length} axes match (${axes.join(', ')}); the judge must justify the difference`);
    }
  }

  return { verdict, reasons };
}
