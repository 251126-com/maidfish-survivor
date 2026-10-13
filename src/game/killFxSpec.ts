// 击杀爆散特效规格（纯函数，不依赖 Phaser，可单测）：
// 按敌人类型给出粒子数量/颜色/速度区间/尺寸，克制数量保证移动端稳定。
export interface KillFxSpec {
  count: number;
  colors: number[];
  speed: [number, number];
  size: number;
}

export function killFxSpec(defId: string): KillFxSpec {
  switch (defId) {
    case 'fat':
      return { count: 10, colors: [0xffd447, 0xfff0c0, 0x7ec8ff], speed: [120, 260], size: 4 };
    case 'dart':
      return { count: 5, colors: [0xa8e0ff, 0xffffff], speed: [90, 200], size: 3 };
    case 'boss':
      return { count: 30, colors: [0x4de8c2, 0xff7a4d, 0xffd447], speed: [180, 380], size: 5 };
    default:
      return { count: 5, colors: [0x7ec8ff, 0xd8f0ff], speed: [80, 190], size: 3 };
  }
}
