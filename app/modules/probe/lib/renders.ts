interface Fiber {
  readonly type: unknown;
  readonly flags: number;
  readonly alternate: Fiber | null;
  readonly child: Fiber | null;
  readonly sibling: Fiber | null;
}

interface FiberRoot {
  readonly current: Fiber;
}

interface ReactHook {
  readonly supportsFiber: true;
  readonly renderers: Map<number, unknown>;
  readonly checkDCE: () => null;
  readonly inject: (renderer: unknown) => number;
  readonly onCommitFiberRoot: (renderer: number, root: FiberRoot) => void;
  readonly onCommitFiberUnmount: () => null;
  readonly onScheduleFiberRoot: (renderer: number, root: unknown, element: unknown) => void;
}

interface Reported {
  readonly rendered: (name: string) => void;
  readonly scheduled: (element: unknown) => void;
}

const FIRST_RENDERER = 1;

const PERFORMED_WORK = 1;
const LOWEST_BIT_SPAN = 2;

function didRender(fiber: Fiber): boolean {
  return fiber.alternate === null || fiber.flags % LOWEST_BIT_SPAN === PERFORMED_WORK;
}

function changedChild(fiber: Fiber): Fiber | null {
  if (fiber.alternate !== null && fiber.child === fiber.alternate.child) {
    return null;
  }
  return fiber.child;
}

function nextOf(fiber: Fiber): readonly Fiber[] {
  return [fiber.sibling, changedChild(fiber)].filter((next) => next !== null);
}

function rendersIn(root: Fiber, rendered: (name: string) => void): void {
  const left: Fiber[] = [root];
  for (const fiber of left) {
    if (typeof fiber.type === "function" && didRender(fiber)) {
      rendered(fiber.type.name);
    }
    left.push(...nextOf(fiber));
  }
}

function reactHook({ rendered, scheduled }: Reported): ReactHook {
  const renderers = new Map<number, unknown>();
  return {
    checkDCE: () => null,
    inject: (renderer) => {
      const id = renderers.size + FIRST_RENDERER;
      renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot: (_renderer, root) => {
      rendersIn(root.current, rendered);
    },
    onCommitFiberUnmount: () => null,
    onScheduleFiberRoot: (_renderer, _root, element) => {
      scheduled(element);
    },
    renderers,
    supportsFiber: true,
  };
}

export { type ReactHook, reactHook };
