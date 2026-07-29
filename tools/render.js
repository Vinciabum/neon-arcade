export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 치환되지 않은 토큰이 남으면 던진다.
// {{TITLE}}이 그대로 박힌 페이지가 배포되는 사고를 막는다.
export function fill(template, values) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  const leftover = out.match(/\{\{([A-Z_]+)\}\}/);
  if (leftover) {
    throw new Error(`unfilled token: ${leftover[1]}`);
  }
  return out;
}
