// 스크린샷 두 장의 차이와 한 장의 표준편차를 재는 공용 유틸.
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

// 변화한 픽셀의 비율(0~1). 노이즈 문턱을 넘은 픽셀만 센다.
// 평균 절대차는 작은 스프라이트가 큰 화면에서 움직이면 0에 가깝게 희석된다 —
// 실측: 3칸 스네이크가 900x600에서 정상 반응해도 mean diff 0.6 (임계값 6).
// 그래서 "얼마나 달라졌나"가 아니라 "몇 개가 달라졌나"를 센다.
export async function changedFraction(a, b, { width = 192, height = 144, noise = 18 } = {}) {
  const shrinkTo = (buf) => sharp(buf).resize(width, height, { fit: 'fill' }).greyscale().raw().toBuffer();
  const [x, y] = await Promise.all([shrinkTo(a), shrinkTo(b)]);
  let changed = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > noise) changed++;
  return changed / x.length;
}

// 64x48 그레이스케일 축소본의 모집단 표준편차(population standard deviation). 단색 화면(빈 캔버스)이면 0에 가깝다.
export async function stddev(buf) {
  const px = await shrink(buf);
  let sum = 0;
  for (let i = 0; i < px.length; i++) sum += px[i];
  const mean = sum / px.length;
  let sq = 0;
  for (let i = 0; i < px.length; i++) sq += (px[i] - mean) ** 2;
  return Math.sqrt(sq / px.length);
}
