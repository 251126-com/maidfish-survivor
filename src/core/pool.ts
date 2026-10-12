// 通用对象池：割草游戏每帧大量生成/销毁实体，必须池化避免 GC
// 设计要点：release 只打标记（O(1)），每帧末统一 compact 回收，避免 splice/indexOf 的 O(n)

export interface Poolable {
  active: boolean;
  spawn(): void;    // 取用时重置状态
  despawn(): void;  // 释放时隐藏/复位
}

export class EntityPool<T extends Poolable> {
  private free: T[] = [];
  readonly live: T[] = [];   // 活跃对象，遍历时只走这个数组
  private _peak = 0;

  private factory: () => T;
  private limit: number;

  // 注意：不使用 TS 参数属性（constructor(private x)），
  // 因为 Node 的 strip-only 模式不支持该语法，测试无法直接跑 TS 源码
  constructor(factory: () => T, limit: number) {
    this.factory = factory;
    this.limit = limit;
  }

  get activeCount(): number { return this.live.length; }
  get peak(): number { return this._peak; }

  // 取一个可用对象；到达上限返回 null（调用方据此拒绝生成，保帧率）
  acquire(): T | null {
    let it: T;
    if (this.free.length > 0) {
      it = this.free.pop()!;
    } else {
      if (this.live.length >= this.limit) return null;
      it = this.factory();
    }
    it.active = true;
    it.spawn();
    this.live.push(it);
    if (this.live.length > this._peak) this._peak = this.live.length;
    return it;
  }

  // 只打标记，真正的回收交给 compact
  release(it: T): void {
    if (!it.active) return;
    it.active = false;
    it.despawn();
  }

  // 每帧末调用一次：把已释放对象移入空闲表（swap-remove，零分配）
  compact(): void {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      if (!live[i].active) {
        this.free.push(live[i]);
        const last = live.length - 1;
        live[i] = live[last];   // 被换过来的元素索引更大，倒序遍历已检查过，不会漏
        live.pop();
      }
    }
  }

  releaseAll(): void {
    for (let i = 0; i < this.live.length; i++) {
      const it = this.live[i];
      it.active = false;
      it.despawn();
      this.free.push(it);
    }
    this.live.length = 0;
  }
}