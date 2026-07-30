// 스크린샷 두 장의 차이와 한 장의 분산을 재는 공용 유틸.
// 64x48 그레이스케일로 줄여 비교한다 — 렌더 노이즈에 둔감하고 충분히 빠르다.
import sharp from 'sharp';

const shrink = (buf) => sharp(buf).resize(64, 48, { fit: 'fill' }).greyscale().raw().toBuffer();

// 평균 절대 픽셀차 (0~255)
export async function diff(a, b) {
  const [x, y] = await Promise.all([shrink(a), shrink(b)]);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  return sum / x.length;
}

// 표준편차. 단색 화면(빈 캔버스)이면 0에 가깝다.
export async function variance(buf) {
  const px = await shrink(buf);
  let sum = 0;
  for (let i = 0; i < px.length; i++) sum += px[i];
  const mean = sum / px.length;
  let sq = 0;
  for (let i = 0; i < px.length; i++) sq += (px[i] - mean) ** 2;
  return Math.sqrt(sq / px.length);
}
