import { writable } from 'svelte/store';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export const toasts = writable<Toast[]>([]);
let nextId = 1;

export function toast(kind: Toast['kind'], message: string): void {
  const id = nextId++;
  toasts.update((list) => [...list, { id, kind, message }]);
  setTimeout(() => {
    toasts.update((list) => list.filter((t) => t.id !== id));
  }, 3500);
}

export const toastSuccess = (msg: string) => toast('success', msg);
export const toastError = (msg: string) => toast('error', msg);
export const toastInfo = (msg: string) => toast('info', msg);
