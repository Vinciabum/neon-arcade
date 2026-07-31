// 게임 하나를 네 값으로 요약한다. 게이트 4(중복 방지)가 이것만 보고 판정한다.
// 자유 문자열을 허용하지 않는 이유: 같은 개념이 다른 단어로 들어오면 중복 검사가 무력해진다.
// (예: "tap" 과 "tap-target" 이 섞이면 두 게임이 다른 것으로 읽힌다)
// 새 게임이 기존 축에 안 맞으면 여기에 값을 추가한다 — 그 추가 자체가 새 장르라는 뜻이다.

export const AXES = {
  input: [
    'one-button',        // 점프 하나. 탭/스페이스
    'steer-horizontal',  // 좌우만
    'steer-free',        // 상하좌우 자유 이동
    'swipe-turn',        // 진행 방향을 꺾는다
    'tap-target',        // 화면의 특정 대상을 누른다
    'type-answer',       // 값을 입력한다
    'drag-object'        // 대상을 끌어 옮긴다
  ],
  goal: [
    'survive',           // 오래 버틴다
    'destroy',           // 적/대상을 없앤다
    'collect',           // 모아서 커진다
    'clear-board',       // 판을 비운다
    'match-pairs',       // 짝을 맞춘다
    'recall-sequence',   // 순서를 기억해 재현한다
    'climb',             // 높이를 올린다
    'solve'              // 문제를 푼다
  ],
  failure: [
    'collision',         // 부딪히면 끝
    'fall',              // 떨어지면 끝
    'ball-lost',         // 공을 놓치면 끝
    'timeout',           // 시간/도달로 끝
    'wrong-input',       // 틀리면 끝
    'none'               // 실패 조건 없음 (퍼즐형)
  ],
  world: [
    'auto-scroll',       // 화면이 자동으로 흐른다
    'vertical-scroll',   // 위로 올라간다
    'fixed-grid',        // 고정 격자
    'fixed-arena',       // 고정 화면, 격자 아님
    'free-arena',        // 자유 이동 공간
    'falling-column'     // 위에서 떨어진다
  ]
};

export const AXIS_NAMES = Object.keys(AXES);

// 값이 허용 목록에 있는지 확인한다. 오타 하나로 중복 검사가 조용히 죽는 것을 막는다.
export function validateMechanics(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['mechanics is missing'];
  for (const axis of AXIS_NAMES) {
    const value = m[axis];
    if (value === undefined || value === null || value === '') {
      errors.push(`mechanics.${axis} is missing`);
    } else if (!AXES[axis].includes(value)) {
      errors.push(`mechanics.${axis} "${value}" is not a known value — add it to tools/mechanics.js if this is genuinely new`);
    }
  }
  return errors;
}
