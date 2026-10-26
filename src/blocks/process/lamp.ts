/**
 * Геометрия настольной лампы для блока «Как я работаю». Считается один раз при сборке страницы
 * (Process.astro) и в браузере (process.ts берёт отсюда точки шарниров и маршрут лупы).
 * Одна и та же фигура выдаётся в трёх видах: набросок от руки, чистый контур чертежа и детали.
 */
export type P = [number, number];

// видимая часть рисунка: от левого края подставки (с запасом под лупу) до края светового пятна справа
export const VB_X = 100;
export const VB_Y = 64;
export const VB_W = 650;
export const BENCH = 404; // линия стола = низ рисунка
export const VB_H = BENCH;

const R = Math.PI / 180;
const r1 = (n: number) => Math.round(n * 10) / 10;
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
/** направление по «математическому» углу (против часовой от +x), ось y экрана вниз */
const dir = (deg: number): P => [Math.cos(deg * R), -Math.sin(deg * R)];
const pt = (p: P) => `${r1(p[0])} ${r1(p[1])}`;

/* ---------- скелет ---------- */
export const ARM_R = 9;
export const JOINT_R = 12;
export const A1 = 100; // нижнее плечо чуть назад
export const A2 = 24; // верхнее плечо вперёд
export const L1 = 176;
export const L2 = 178;
export const J0: P = [214, 366];
export const J1: P = add(J0, mul(dir(A1), L1));
export const J2: P = add(J1, mul(dir(A2), L2));
// плафон смотрит вниз и вперёд
const SD = unit(dir(-60));
const SN: P = [-SD[1], SD[0]];
const HB = 20;
const HF = 62;
// затылок плафона: дуга вокруг верхнего шарнира, концентрично с ним; боковины касаются дуги без излома
const SB = J2;
const SF = add(J2, mul(SD, 102));
const FL = add(SF, mul(SN, HF));
const FR = sub(SF, mul(SN, HF));
/** точка касания прямой из p к окружности (c, r) с нужной стороны от оси плафона */
const touch = (p: P, c: P, r: number, side: 1 | -1): P => {
  const v = sub(p, c), d = len(v), a = Math.acos(r / d), b = Math.atan2(v[1], v[0]);
  const t1: P = add(c, mul([Math.cos(b + a), Math.sin(b + a)], r)), t2: P = add(c, mul([Math.cos(b - a), Math.sin(b - a)], r));
  const dot = (t: P) => (t[0] - c[0]) * SN[0] + (t[1] - c[1]) * SN[1];
  return dot(t1) * side > dot(t2) * side ? t1 : t2;
};
const BL = touch(FL, SB, HB, 1);
const BR = touch(FR, SB, HB, -1);
export const BULB: P = sub(SF, mul(SD, 3));
export const BULB_R = 25;

/* ---------- контуры ---------- */
const capsuleD = (a: P, b: P, r: number) => {
  const u = unit(sub(b, a));
  const n: P = [-u[1], u[0]];
  return `M${pt(add(a, mul(n, r)))}L${pt(add(b, mul(n, r)))}A${r} ${r} 0 0 0 ${pt(sub(b, mul(n, r)))}L${pt(sub(a, mul(n, r)))}A${r} ${r} 0 0 0 ${pt(add(a, mul(n, r)))}Z`;
};
const circleD = (c: P, r: number) => `M${pt([c[0] - r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] + r, c[1]])}A${r} ${r} 0 1 1 ${pt([c[0] - r, c[1]])}Z`;
const rrectD = (x: number, y: number, w: number, h: number, r: number) =>
  `M${pt([x + r, y])}H${r1(x + w - r)}A${r} ${r} 0 0 1 ${pt([x + w, y + r])}V${r1(y + h - r)}A${r} ${r} 0 0 1 ${pt([x + w - r, y + h])}H${r1(x + r)}A${r} ${r} 0 0 1 ${pt([x, y + h - r])}V${r1(y + r)}A${r} ${r} 0 0 1 ${pt([x + r, y])}Z`;

export const PLATE = { x: 132, y: 388, w: 164, h: 16, r: 8 };
const DOME_A: P = [158, 388];
const DOME_B: P = [270, 388];
const DOME_C1: P = [166, 356];
const DOME_C2: P = [262, 356];
const domeD = `M${pt(DOME_A)}C${pt(DOME_C1)} ${pt(DOME_C2)} ${pt(DOME_B)}Z`;
const shadeD = `M${pt(BL)}A${HB} ${HB} 0 1 1 ${pt(BR)}L${pt(FR)}L${pt(FL)}Z`;

export const SHAPES: Record<string, string> = {
  plate: rrectD(PLATE.x, PLATE.y, PLATE.w, PLATE.h, PLATE.r),
  dome: domeD,
  arm1: capsuleD(J0, J1, ARM_R),
  arm2: capsuleD(J1, J2, ARM_R),
  bulb: circleD(BULB, BULB_R),
  shade: shadeD,
  j0: circleD(J0, JOINT_R),
  j1: circleD(J1, JOINT_R),
  j2: circleD(J2, JOINT_R),
};
export const ORDER = ['plate', 'dome', 'arm1', 'arm2', 'bulb', 'shade', 'j0', 'j1', 'j2'];
/** у какой детали какой шарнир: шарниры поверх плеч */
export const JOINTS: Record<string, P> = { j0: J0, j1: J1, j2: J2 };

/* ---------- точки контуров для наброска ---------- */
function sampleLine(a: P, b: P, step = 9): P[] {
  const n = Math.max(1, Math.round(len(sub(b, a)) / step));
  return Array.from({ length: n }, (_, i) => add(a, mul(sub(b, a), i / n)));
}
function sampleArc(c: P, r: number, from: number, to: number, step = 9): P[] {
  const n = Math.max(2, Math.round((Math.abs(to - from) * R * r) / step));
  return Array.from({ length: n }, (_, i) => {
    const t = (from + ((to - from) * i) / n) * R;
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] as P;
  });
}
const ang = (v: P) => Math.atan2(v[1], v[0]) / R; // экранный угол
function capsulePts(a: P, b: P, r: number): P[] {
  const u = unit(sub(b, a));
  const n: P = [-u[1], u[0]];
  const an = ang(n);
  return [
    ...sampleLine(add(a, mul(n, r)), add(b, mul(n, r))),
    ...sampleArc(b, r, an, an - 180),
    ...sampleLine(sub(b, mul(n, r)), sub(a, mul(n, r))),
    ...sampleArc(a, r, an - 180, an - 360),
  ];
}
const circlePts = (c: P, r: number) => sampleArc(c, r, 180, 540);
function rrectPts(x: number, y: number, w: number, h: number, r: number): P[] {
  return [
    ...sampleLine([x + r, y], [x + w - r, y]), ...sampleArc([x + w - r, y + r], r, -90, 0),
    ...sampleLine([x + w, y + r], [x + w, y + h - r]), ...sampleArc([x + w - r, y + h - r], r, 0, 90),
    ...sampleLine([x + w - r, y + h], [x + r, y + h]), ...sampleArc([x + r, y + h - r], r, 90, 180),
    ...sampleLine([x, y + h - r], [x, y + r]), ...sampleArc([x + r, y + r], r, 180, 270),
  ];
}
function bezierPts(a: P, c1: P, c2: P, b: P, n = 14): P[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, m = 1 - t;
    return [m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0], m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1]] as P;
  });
}
const shadePts = (): P[] => {
  const aL = ang(sub(BL, SB));
  let aR = ang(sub(BR, SB));
  while (aR < aL) aR += 360;
  return [...sampleArc(SB, HB, aL, aR), ...sampleLine(BR, FR), ...sampleLine(FR, FL), ...sampleLine(FL, BL)];
};
/* В наброске три ошибки, на них и стоят вопросы: верхнее плечо не доходит до локтя,
   лампочка выпала из плафона, подставка перекошена и лампа качается. На чертеже всё встаёт на место. */
const U2 = unit(sub(J2, J1));
export const GAP_FROM = 34; // где начинается плечо в наброске, от центра локтя
const ARM2_START = add(J1, mul(U2, GAP_FROM));
export const BULB_LOST: P = add(SF, mul(SD, 36));
const TILT = -6 * R; // подставка задрана правым краем
const PLATE_PIVOT: P = [PLATE.x, PLATE.y + PLATE.h];
const tilt = (p: P): P => { const v = sub(p, PLATE_PIVOT); return add(PLATE_PIVOT, [v[0] * Math.cos(TILT) - v[1] * Math.sin(TILT), v[0] * Math.sin(TILT) + v[1] * Math.cos(TILT)]); };
const PTS: Record<string, P[]> = {
  plate: rrectPts(PLATE.x, PLATE.y, PLATE.w, PLATE.h, PLATE.r).map(tilt),
  dome: [...bezierPts(DOME_A, DOME_C1, DOME_C2, DOME_B), ...sampleLine(DOME_B, DOME_A)],
  arm1: capsulePts(J0, J1, ARM_R),
  arm2: capsulePts(ARM2_START, J2, ARM_R),
  bulb: circlePts(BULB_LOST, BULB_R),
  shade: shadePts(),
  j0: circlePts(J0, JOINT_R),
  j1: circlePts(J1, JOINT_R),
  j2: circlePts(J2, JOINT_R),
};

/* ---------- набросок: дрожащая линия с перехлёстом ---------- */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function smooth(p: P[]) {
  let d = `M${pt(p[0])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], e = p[Math.min(p.length - 1, i + 2)];
    d += `C${pt(add(b, mul(sub(c, a), 1 / 6)))} ${pt(sub(c, mul(sub(e, b), 1 / 6)))} ${pt(c)}`;
  }
  return d;
}
function scribble(pts: P[], seed: number, amp: number) {
  const rnd = rng(seed);
  const N = pts.length;
  const f1 = 1.5 + rnd() * 1.5, f2 = 4 + rnd() * 3, p1 = rnd() * 6.3, p2 = rnd() * 6.3;
  const total = Math.round(N * 1.16);
  const out: P[] = [];
  for (let k = 0; k <= total; k++) {
    const i = k % N;
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    const nn = unit([-(b[1] - a[1]), b[0] - a[0]]);
    const t = k / N;
    const off = amp * (0.7 * Math.sin(f1 * t * 6.283 + p1) + 0.3 * Math.sin(f2 * t * 6.283 + p2)) + amp * 1.3 * (k / total) - amp * 0.4;
    out.push(add(pts[i], mul(nn, off)));
  }
  return smooth(out);
}
const AMP: Record<string, number> = { plate: 3, dome: 3.4, arm1: 3.6, arm2: 3.6, bulb: 2.6, shade: 4.2, j0: 2, j1: 2, j2: 2 };
export const SKETCH: Record<string, string> = Object.fromEntries(ORDER.map((k, i) => [k, scribble(PTS[k], 11 + i * 7, AMP[k])]));

/* ---------- пружина вдоль нижнего плеча ---------- */
export const SPRING = (() => {
  const u = unit(sub(J1, J0));
  const n: P = [-u[1], u[0]];
  const a = add(J0, mul(sub(J1, J0), 0.2)), b = add(J0, mul(sub(J1, J0), 0.78));
  const side = 16;
  const coils = 11;
  // витки пружины: петли вдоль плеча
  let d = `M${pt(add(a, mul(n, -ARM_R + 1)))}L${pt(add(a, mul(n, -side)))}`;
  const step = mul(sub(b, a), 1 / coils);
  for (let i = 0; i < coils; i++) {
    const p = add(a, mul(step, i));
    const q = add(p, step);
    d += `C${pt(add(add(p, mul(step, 0.1)), mul(n, -side - 9)))} ${pt(add(add(p, mul(step, 1.25)), mul(n, -side - 9)))} ${pt(add(add(p, mul(step, 0.9)), mul(n, -side)))}`;
    d += `L${pt(add(q, mul(n, -side)))}`;
  }
  d += `L${pt(add(b, mul(n, -ARM_R + 1)))}`;
  return d;
})();

/* ---------- свет ---------- */
const rayL = unit(dir(-60 - 26));
const rayR = unit(dir(-60 + 10));
const hit = (o: P, v: P): P => add(o, mul(v, (BENCH - o[1]) / v[1]));
// луч длиннее, чем до стола: дальний край всегда за концом градиента (прозрачный), а ниже стола его срезает
// край рисунка. Поэтому, когда плафон поворачивается за курсором, у луча нет видимого обреза.
const RAY = 330;
export const CONE = `M${pt(FL)}L${pt(FR)}L${pt(add(FR, mul(rayR, RAY)))}L${pt(add(FL, mul(rayL, RAY)))}Z`;
export const CONE_GRAD = { x1: r1(SF[0]), y1: r1(SF[1]), x2: r1(add(SF, mul(SD, 230))[0]), y2: r1(add(SF, mul(SD, 230))[1]) };
export const RIM = `M${pt(FL)}L${pt(FR)}`;
const poolX = (hit(FL, rayL)[0] + hit(FR, rayR)[0]) / 2;
// галочка висит в луче на середине высоты, справа от лампочки
export const CHECK_C: P = [Math.round(poolX - 10), BENCH - 124];
export const CHECK_R = 29;
export const CHECK_CIRCLE = circleD(CHECK_C, CHECK_R);
export const CHECK_MARK = `M${pt(add(CHECK_C, [-13, 1]))}L${pt(add(CHECK_C, [-4, 10]))}L${pt(add(CHECK_C, [14, -9]))}`;
export const CHECK_RING = circleD(CHECK_C, CHECK_R + 6);
/** искры вокруг галочки: короткие лучи, вылетают наружу */
export const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * 360 + 9;
  return `M${pt(add(CHECK_C, mul(dir(a), CHECK_R + 12)))}L${pt(add(CHECK_C, mul(dir(a), CHECK_R + (i % 2 ? 24 : 32))))}`;
});

/* ---------- включение: вспышка, лучи от лампочки, пятно света на столе, пылинки в луче ---------- */
export const RAYS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * 360;
  return `M${pt(add(BULB, mul(dir(a), BULB_R + 10)))}L${pt(add(BULB, mul(dir(a), BULB_R + (i % 2 ? 40 : 58))))}`;
});
const hitL = hit(FL, rayL)[0], hitR = hit(FR, rayR)[0];
export const POOL = `M${r1(hitL - 10)} ${BENCH}A${r1((hitR - hitL) / 2 + 10)} 14 0 0 1 ${r1(hitR + 10)} ${BENCH}Z`;
export const DUST: { x: number; y: number; r: number }[] = (() => {
  const rnd = rng(7);
  return Array.from({ length: 16 }, () => {
    const along = 30 + rnd() * 230, side = (rnd() - 0.5) * (70 + along * 0.55);
    const p = add(add(SF, mul(SD, along)), mul(SN, side));
    return { x: r1(p[0]), y: r1(p[1]), r: r1(1.2 + rnd() * 1.6) };
  });
})();

/* ---------- блики «полировки» ---------- */
export const GLINTS = [
  (() => { const u = unit(sub(J1, J0)), n: P = [-u[1], u[0]]; return `M${pt(add(add(J0, mul(sub(J1, J0), 0.18)), mul(n, ARM_R - 3.5)))}L${pt(add(add(J0, mul(sub(J1, J0), 0.84)), mul(n, ARM_R - 3.5)))}`; })(),
  (() => { const u = unit(sub(J2, J1)), n: P = [-u[1], u[0]]; return `M${pt(add(add(J1, mul(sub(J2, J1), 0.16)), mul(n, -ARM_R + 3.5)))}L${pt(add(add(J1, mul(sub(J2, J1), 0.82)), mul(n, -ARM_R + 3.5)))}`; })(),
  `M${pt(add(add(BL, mul(sub(FL, BL), 0.22)), mul(SN, -7)))}L${pt(add(add(BL, mul(sub(FL, BL), 0.8)), mul(SN, -9)))}`,
  `M178 376C186 364 206 360 222 360`,
];

/* ---------- чертёж: осевые и размеры ---------- */
const TOP = Math.min(J2[1] - JOINT_R, BR[1] - HB);
const DIM_X = 540; // общая высота: справа от лампы, где на чертеже пусто
const tick = (p: P) => `M${pt(add(p, [-5, 5]))}L${pt(add(p, [5, -5]))}`;
const arcPath = (c: P, r: number, a0: number, a1: number) => {
  const p0 = add(c, mul(dir(a0), r)), p1 = add(c, mul(dir(a1), r));
  return `M${pt(p0)}A${r} ${r} 0 0 0 ${pt(p1)}`;
};
const ext = (a: P, b: P, k: number) => { const u = unit(sub(b, a)); return `M${pt(sub(a, mul(u, k)))}L${pt(add(b, mul(u, k)))}`; };
const O1 = (() => { const u = unit(sub(J1, J0)); return [u[1], -u[0]] as P; })(); // слева от плеча
const A1D = add(J0, mul(O1, 34)), A1E = add(J1, mul(O1, 34));
const OP = mul(SD, 34);
export const AXES = [ext(J0, J1, 22), ext(J1, J2, 22), ext(J2, add(SF, mul(SD, 30)), 10)];
export const DIMS = [
  // общая высота: от стола до верха плафона
  `M${r1(J2[0] + 22)} ${r1(TOP)}H${DIM_X + 8}`,
  `M${DIM_X} ${BENCH - 0.5}V${r1(TOP)}${tick([DIM_X, BENCH - 0.5])}${tick([DIM_X, TOP])}`,
  // длина нижнего плеча
  `M${pt(add(J0, mul(O1, 14)))}L${pt(add(J0, mul(O1, 42)))}M${pt(add(J1, mul(O1, 14)))}L${pt(add(J1, mul(O1, 42)))}`,
  `M${pt(A1D)}L${pt(A1E)}${tick(A1D)}${tick(A1E)}`,
  // угол в локте
  arcPath(J1, 46, A1 + 180, A2 + 360),
  // диаметр плафона
  `M${pt(add(FL, mul(SD, 8)))}L${pt(add(FL, mul(SD, 44)))}M${pt(add(FR, mul(SD, 8)))}L${pt(add(FR, mul(SD, 44)))}`,
  `M${pt(add(FL, OP))}L${pt(add(FR, OP))}${tick(add(FL, OP))}${tick(add(FR, OP))}`,
];
const mid = (a: P, b: P) => mul(add(a, b), 0.5);
const rotOf = (a: P, b: P) => Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) / R) * 10) / 10;
const elbowMid = add(J1, mul(dir((A1 + 180 + A2 + 360) / 2), 66));
export const LABELS: { x: number; y: number; rot: number; text: string }[] = [
  { x: DIM_X - 12, y: (BENCH + TOP) / 2, rot: -90, text: String(Math.round(BENCH - TOP)) },
  { ...(() => { const m = add(mid(A1D, A1E), mul(O1, 12)); return { x: m[0], y: m[1] }; })(), rot: rotOf(A1E, A1D) + 180, text: String(L1) },
  { x: elbowMid[0] + 4, y: elbowMid[1] + 4, rot: 0, text: `${Math.round(A2 + 360 - (A1 + 180))}°` },
  { ...(() => { const m = add(mid(FL, FR), mul(SD, 50)); return { x: m[0], y: m[1] }; })(), rot: rotOf(FL, FR), text: `Ø${HF * 2}` },
].map((l) => ({ ...l, x: r1(l.x), y: r1(l.y) }));

/* ---------- человечек: стоит у лампы и не знает, что с ней делать ---------- */
const MAN_X = 500;
export const MAN = {
  head: [MAN_X, 351] as P,
  body: `M${MAN_X} 358V381M${MAN_X} 381L${MAN_X - 7} 403M${MAN_X} 381L${MAN_X + 7} 403`,
  armL: `M${MAN_X} 366L${MAN_X - 9} 380`,
  // правая рука чешет затылок; поворачивается вокруг плеча
  armR: `M${MAN_X} 366L${MAN_X + 11} 360L${MAN_X + 8} 348`,
  // догадался: рука вверх
  armUp: `M${MAN_X} 366L${MAN_X + 9} 355L${MAN_X + 12} 340`,
  shoulder: [MAN_X, 366] as P,
};

/* ---------- вопросы и маршрут лупы ---------- */
// вопросы у ошибок наброска: над разрывом в локте, в выпавшей лампочке, над головой человечка, над задранной подставкой
const gapMid = add(J1, mul(U2, (JOINT_R + GAP_FROM - ARM_R) / 2));
export const MARKS: P[] = [add(gapMid, mul([U2[1], -U2[0]], 26)), BULB_LOST, [MAN_X + 3, 325], [288, 352]].map((p) => [r1(p[0]), r1(p[1])] as P);
// у человечка лупа встаёт на голову: в стекле крупно голова, шея и облачко мыслей (в нём он ругается
// звёздочками), а туловище и ноги видны под лупой как есть
export const MAN_STOP: P = [MAN_X + 5, 335];
export const MAN_VIEW: P = [MAN_X + 5, 340];
// лупа встаёт ровно на вопрос: он оказывается в центре стекла
export const LENS_STOPS: P[] = [MARKS[0], MARKS[1], MAN_STOP, MARKS[3]];
/** где может стоять центр лупы: стекло и ручка не заходят на мягкие края рисунка, а оправа всегда над столом.
 *  hand: ручка идёт по диагонали от оправы до этой точки */
export const LENS = { r: 34, hand: 50, minX: 166, minY: 128, maxY: 354, right: 622 };
/* облачко мыслей: над головой справа, к нему от макушки два кружка. Нарисовано в самом наброске и видно
   только в лупе (лежит в её увеличенной копии) */
export const THINK: P = [MAN_X + 9, 330.5];
export const THINK_DOTS: [P, number][] = [[[MAN_X + 4.5, 341.8], 1.2], [[MAN_X + 7, 338.6], 1.7]];
export const THINK_CLOUD = (() => {
  // пузыри по эллипсу: дуги наружу между соседними точками
  const rx = 13.5, ry = 6.6, n = 9;
  const pts: P[] = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return [r1(rx * Math.cos(a)), r1(ry * Math.sin(a))]; });
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  pts.forEach((p, i) => { const q = pts[(i + 1) % n]; const r = r1(Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.56); d += `A${r} ${r} 0 0 1 ${q[0]} ${q[1]}`; });
  return d + 'Z';
})();

/* ---------- шестерня каретки ---------- */
export function gear(teeth = 14, ro = 29, ri = 25, hole = 0) {
  let d = '';
  const step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [a - step * 0.28, a - step * 0.16, a + step * 0.16, a + step * 0.28].map((t, k) => {
      const r = k === 0 || k === 3 ? ri : ro;
      return [30 + r * Math.cos(t * R), 30 + r * Math.sin(t * R)] as P;
    });
    const next = [30 + ri * Math.cos((a + step * 0.72) * R), 30 + ri * Math.sin((a + step * 0.72) * R)] as P;
    d += `${i ? 'L' : 'M'}${pt(pts[0])}L${pt(pts[1])}L${pt(pts[2])}L${pt(pts[3])}A${ri} ${ri} 0 0 1 ${pt(next)}`;
  }
  return hole ? `${d}Z${circleD([30, 30], hole)}` : `${d}Z`;
}
