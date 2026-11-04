export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

export interface ToastInput {
  message: string;
  kind?: ToastKind;
  action?: ToastAction;
  /** Milliseconds; defaults to 5000. Use Infinity to keep it until dismissed. */
  duration?: number;
}

let counter = 0;

class ToastStore {
  items = $state<ToastItem[]>([]);
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  show(input: ToastInput): string {
    counter += 1;
    const id = `toast-${Date.now()}-${counter}`;
    const item: ToastItem = {
      id,
      message: input.message,
      kind: input.kind ?? 'info',
      action: input.action,
    };
    this.items = [...this.items, item];

    const duration = input.duration ?? 5000;
    if (Number.isFinite(duration)) {
      const timer = setTimeout(() => this.dismiss(id), duration);
      this.timers.set(id, timer);
    }
    return id;
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.items = this.items.filter((item) => item.id !== id);
  }

  async runAction(id: string): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item?.action) return;
    this.dismiss(id);
    await item.action.onClick();
  }
}

export const toasts = new ToastStore();
