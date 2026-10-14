// 角色分层/表情/持枪的纯逻辑（可单测，不依赖 Phaser）
//
// 说明（程序化分层/叠加方法，非手绘帧）：
//  - 角色本体 = 用户已授权的 player_whale.png（308x320）整体作为「身体层」，保持原设计忠实还原；
//  - 表情 = 程序化绘制的 7 张静态小贴图（idle/move/fire/hurt/alert/win/lose），
//           用「皮肤色椭圆先盖住原图的眼睛，再在上面画新表情眼睛+嘴」的叠加方式，
//           对齐到素材真实面部锚点（从图片像素分析得出：双眼/嘴在原图中的坐标）；
//  - 持枪 = 程序化绘制的「蓝色鲸鱼枪」贴图，铰接在角色侧手部锚点，
//           随最近敌人瞄准旋转 + 朝向翻转 + 开火后坐（枪身反向后拉）——不是新角色造型。

// 原图面部锚点（像素，左上方为原点）：
// 从 player_whale.png 像素分析（深色瞳/嘴部聚类）得出：
//   左眼 (150,36) 右眼 (182,36) 嘴 (176,48)，脸中心 (166,40)
export const FACE = {
  imgW: 308,
  imgH: 320,
  center: { x: 166, y: 40 },
  eyeL: { x: 150, y: 36 },
  eyeR: { x: 182, y: 36 },
  mouth: { x: 176, y: 48 }
} as const;

/** 控枪铰接点（原图右手侧）：手持枪把位置 */
export const GUN_ANCHOR = {
  imgW: 308,
  imgH: 320,
  /** 枪把（角色握持处）在原图中的像素坐标（右手侧） */
  handle: { x: 250, y: 172 },
  /** 枪口在枪贴图自身坐标系（原点=枪把）中的方向：枪贴图默认朝 +X */
  muzzleX: 34
} as const;

export type ExpressionState =
  | 'idle' | 'move' | 'fire' | 'hurt' | 'alert' | 'win' | 'lose';

export interface ExprFlags {
  moving: boolean;
  firing: boolean;
  hurt: boolean;
  alert: boolean; // Boss 预警/阶段变化等需要警觉表情
  win: boolean;
  lose: boolean;
}

/** 表情优先级：hurt > alert > fire > move > idle（胜负表情由外部仅出现一次时使用） */
export function pickExpression(f: ExprFlags): ExpressionState {
  if (f.lose) return 'lose';
  if (f.win) return 'win';
  if (f.hurt) return 'hurt';
  if (f.alert) return 'alert';
  if (f.firing) return 'fire';
  if (f.moving) return 'move';
  return 'idle';
}

/**
 * 眨眼：帧率无关（只与累计时间有关）。
 * 以 3.6s 为周期，状态落在最后 11% 内则闭眼。返回 true=闭眼。
 */
export function blinkState(tSec: number): boolean {
  const cycle = 3.6;
  const k = ((tSec + 1.2) % cycle + cycle) % cycle;
  return k < cycle * 0.11;
}

/** 面部叠加层相对角色贴图中心（sprite origin 0.5,0.5）的显示偏移（px，按 displayH 缩放基准）。 */
export function faceScreenOffset(displayH: number): { cx: number; cy: number } {
  const s = displayH / FACE.imgH;
  return {
    cx: (FACE.center.x - FACE.imgW / 2) * s,
    cy: (FACE.center.y - FACE.imgH / 2) * s
  };
}

/** 左右眼叠加偏移（相对面部叠加层中心，px；眼睛间距精细对齐用） */
export function eyeOffsets(displayH: number): { ex: number; ey: number; eyeGap: number } {
  const s = displayH / FACE.imgH;
  const ex = (FACE.eyeL.x + FACE.eyeR.x) / 2 - FACE.center.x;
  const ey = FACE.eyeL.y - FACE.center.y;
  const eyeGap = (FACE.eyeR.x - FACE.eyeL.x) * s;
  return { ex: ex * s, ey: ey * s, eyeGap };
}

/** 嘴部叠加偏移（相对面部叠加层中心，px） */
export function mouthOffset(displayH: number): { mx: number; my: number } {
  const s = displayH / FACE.imgH;
  return {
    mx: (FACE.mouth.x - FACE.center.x) * s,
    my: (FACE.mouth.y - FACE.center.y) * s
  };
}

/**
 * 持枪姿态解算：
 * 枪贴图默认朝 +X（枪把在 origin，枪口沿 +X）。
 * facing=1（朝右）：rotation = 目标世界角 θ；
 * facing=-1（朝左）：flipX 镜像后须旋转 θ+PI 才能让嘴朝目标。
 * 返回枪 image 所需的 rotation / flipX / 后坐位移（沿瞄准反向）。
 */
export function gunPose(facing: 1 | -1, aimAngleRad: number): { rotation: number; flipX: boolean } {
  const flipX = facing < 0;
  const rotation = flipX ? aimAngleRad + Math.PI : aimAngleRad;
  return { rotation, flipX };
}

/** 开火后坐：沿瞄准方向反向的位移（世界向量），用于枪口闪退 */
export function gunRecoilOffset(aimAngleRad: number, amount: number, facing: 1 | -1): { rx: number; ry: number } {
  // 朝瞄准反方向退 amount（左翻时仍保持视觉一致：沿枪身轴线反向）
  const dir = facing < 0 ? -1 : 1;
  return {
    rx: -Math.cos(aimAngleRad) * amount * dir,
    ry: -Math.sin(aimAngleRad) * amount * dir
  };
}

// ===================== v0.16.0 饭盆头完整皮肤锚点 =====================
// bowlhead_maidfish_game320.png（145x320，饭盆头完整立绘：头上铁盆+粉色领结+蓝裙）。
// 由像素分析得出脸部区域位于顶部砖下（左眼/右眼/嘴聚类），右手侧约在肩部高度。
// 女仆装仍使用上方 FACE / GUN_ANCHOR。
export const BOWLHEAD = {
  imgW: 145,
  imgH: 320,
  face: { x: 69, y: 36 },
  eyeL: { x: 66, y: 35 },
  eyeR: { x: 73, y: 35 },
  mouth: { x: 70, y: 40 },
  // 右手侧握枪点（肩部高度右沿）：完整立绘右手在 x≈120, y≈120
  gun: { x: 120, y: 120 }
} as const;

/** 饭盆头脸部中心相对贴图中心（origin 0.5,0.5）的显示偏移（px） */
export function bowlheadFaceOffset(displayH: number): { cx: number; cy: number } {
  const s = displayH / BOWLHEAD.imgH;
  return {
    cx: (BOWLHEAD.face.x - BOWLHEAD.imgW / 2) * s,
    cy: (BOWLHEAD.face.y - BOWLHEAD.imgH / 2) * s
  };
}

/** 饭盆头握枪点相对贴图中心（origin 0.5,0.5）的显示偏移（px） */
export function bowlheadGunOffset(displayH: number): { hx: number; hy: number } {
  const s = displayH / BOWLHEAD.imgH;
  return {
    hx: (BOWLHEAD.gun.x - BOWLHEAD.imgW / 2) * s,
    hy: (BOWLHEAD.gun.y - BOWLHEAD.imgH / 2) * s
  };
}

/**
 * 饭盆头表情叠加层显示缩放：表情贴图按女仆装脸宽绘制（2x 贴图 0.5 显示），
 * 饭盆头脸更小（眼距 ~7px vs 女仆 ~32px），等比缩放到小脸匹配。
 */
export function bowlheadFxScale(displayH: number): number {
  const maidEyeGapDisp = (FACE.eyeR.x - FACE.eyeL.x) * (displayH / FACE.imgH);
  const bowlEyeGapDisp = (BOWLHEAD.eyeR.x - BOWLHEAD.eyeL.x) * (displayH / BOWLHEAD.imgH);
  return Math.max(0.05, 0.5 * bowlEyeGapDisp / maidEyeGapDisp);
}

/** 饭盆头立绘脚底相对贴图中心的水平偏移（px，按 displayH 缩放），用于与女仆装脚底对齐。
 *  女仆装脚底锚点 x≈135（308 宽）、饭盆头脚底锚点 x≈112（145 宽），
 *  两者均以 origin(0.5,0.5) 贴到同一容器点时脚底会错位 ~58px*scale，
 *  返回饭盆头 sprite 应额外平移的 x（负=向左），使两套皮肤的脚底落在同一水平线。
 */
export function bowlheadFootAlignX(displayH: number): number {
  const s = displayH / BOWLHEAD.imgH;
  const maidFootRel = (135 - 308 / 2) / 308;      // 女仆装脚底相对贴图中心（归一化）
  const bowlFootRel = (112 - BOWLHEAD.imgW / 2) / BOWLHEAD.imgW;  // 饭盆头脚底相对贴图中心
  return (maidFootRel - bowlFootRel) * BOWLHEAD.imgW * s;
}
