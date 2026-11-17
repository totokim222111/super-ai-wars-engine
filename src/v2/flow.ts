/**
 * 연출의 시간 흐름.
 *
 * 연출 하나는 "스텝"(제너레이터)이다. `yield`는 "다음 프레임까지 쉰다"는 뜻이고,
 * 다음 프레임이 오면 그 사이 흐른 시간(초)을 돌려받는다. 그래서 연출을 위에서 아래로,
 * 사람이 콘티를 읽는 순서 그대로 쓸 수 있다.
 *
 *   yield* tween(mech, { x: 400 }, 0.2, ease.in);   // 돌진
 *   yield* wait(0.08);                              // 타격 정지
 *   yield* all(shake(camera, 14), tween(foe, { x: 280 }, 0.3));
 *
 * 타이머나 Promise를 쓰지 않으므로 빨리 감기(시간에 배수를 곱함)와 건너뛰기가 공짜로 된다.
 */
export type Step = Generator<void, void, number>;
/** 끝날 때 값을 돌려주는 스텝. `const dead = yield* scene.resolve(...)`처럼 받는다. */
export type Flow<T> = Generator<void, T, number>;

export const ease = {
  linear: (t: number) => t,
  in: (t: number) => t * t * t,
  out: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** 목표를 살짝 지나쳤다가 돌아온다. 숫자·글자가 튀어나올 때 쓴다. */
  back: (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
};
export type Ease = (t: number) => number;

export function* wait(seconds: number): Step {
  let t = 0;
  while (t < seconds) t += yield;
}

/** target의 숫자 속성들을 seconds 동안 to 값으로 옮긴다. */
export function* tween<T extends object>(target: T, to: { [K in keyof T]?: number }, seconds: number, easing: Ease = ease.out): Step {
  const bag = target as Record<string, number>;
  const keys = Object.keys(to), goal = to as Record<string, number>;
  const from = keys.map(k => bag[k]);
  let t = 0;
  while (t < seconds) {
    t += yield;
    const k = easing(Math.min(1, t / seconds));
    keys.forEach((key, i) => { bag[key] = from[i] + (goal[key] - from[i]) * k; });
  }
  keys.forEach(key => { bag[key] = goal[key]; });
}

/** 여러 스텝을 동시에 돌리고, 모두 끝나면 끝난다. */
export function* all(...steps: Step[]): Step {
  let active = steps, dt = 0;
  for (;;) {
    active = active.filter(step => !step.next(dt).done);
    if (!active.length) return;
    dt = yield;
  }
}

/** 조건이 참이 될 때까지 기다린다(예: 플레이어가 누를 때까지). */
export function* until(done: () => boolean): Step {
  while (!done()) yield;
}

/** 스텝들을 프레임마다 돌리는 실행기. speed를 올리면 전체가 빨리 감긴다. */
export class Runner {
  speed = 1;
  /** Unscaled visual clock, including hit-stop; used for bounded screen flashes. */
  elapsed = 0;
  private tasks: Step[] = [];
  private held = 0;
  /**
   * 타격 정지. seconds 동안 모든 연출의 시간이 멈춘다(화면은 계속 그려지므로 흔들림은 살아 있다).
   * 맞는 순간의 그림을 눈에 박아 넣는 장치다. 길수록 묵직하다.
   */
  hold(seconds: number): void { this.held = Math.max(this.held, seconds); }
  /** 스텝을 시작한다. 본 흐름과 따로 도는 효과(파편, 잔상)도 이걸로 띄운다. */
  run(step: Step): void { if (!step.next(0).done) this.tasks.push(step); }
  update(dt: number): void {
    this.elapsed += Math.max(0,dt);
    let scaled = dt * this.speed;
    if (this.held > 0) { this.held -= scaled; scaled = 0; }
    const current = this.tasks;
    // 도는 중에 새로 띄운 스텝(run)이 사라지지 않도록 목록을 먼저 비워 둔다.
    this.tasks = [];
    for (const task of current) if (!task.next(scaled).done) this.tasks.push(task);
  }
  get busy(): boolean { return this.tasks.length > 0; }
  clear(): void { const current=this.tasks;this.tasks=[];this.held=0;for(const task of current)task.return(); }
}
