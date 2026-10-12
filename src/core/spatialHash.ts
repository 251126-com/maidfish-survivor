// 空间哈希：把实体按网格分桶，碰撞查询只查邻近格子
// 有限世界（4000x4000）+ 固定 cellSize，用预分配数组，clear 只置 length=0，零 GC

export class SpatialHash<T> {
  private cols: number;
  private rows: number;
  private cellSize: number;
  private buckets: T[][];
  private _queryCount = 0;   // 调试用：本帧查询命中数

  constructor(cellSize: number, worldW: number, worldH: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldW / cellSize) + 1;
    this.rows = Math.ceil(worldH / cellSize) + 1;
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }

  clear(): void {
    const b = this.buckets;
    for (let i = 0; i < b.length; i++) b[i].length = 0;   // 保留数组容量，避免重建
    this._queryCount = 0;
  }

  private clampCol(c: number): number {
    return c < 0 ? 0 : (c >= this.cols ? this.cols - 1 : c);
  }
  private clampRow(r: number): number {
    return r < 0 ? 0 : (r >= this.rows ? this.rows - 1 : r);
  }

  insert(x: number, y: number, item: T): void {
    const cx = this.clampCol(Math.floor(x / this.cellSize));
    const cy = this.clampRow(Math.floor(y / this.cellSize));
    this.buckets[cy * this.cols + cx].push(item);
  }

  // 查询圆范围内候选对象，结果写入 out（复用外部数组，避免每次分配）
  queryCircle(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const minCx = this.clampCol(Math.floor((x - r) / this.cellSize));
    const maxCx = this.clampCol(Math.floor((x + r) / this.cellSize));
    const minCy = this.clampRow(Math.floor((y - r) / this.cellSize));
    const maxCy = this.clampRow(Math.floor((y + r) / this.cellSize));
    for (let cy = minCy; cy <= maxCy; cy++) {
      const rowBase = cy * this.cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.buckets[rowBase + cx];
        for (let i = 0; i < bucket.length; i++) {
          out.push(bucket[i]);
          this._queryCount++;
        }
      }
    }
    return out;
  }

  get stats(): { queryCount: number; cells: number } {
    return { queryCount: this._queryCount, cells: this.buckets.length };
  }
}