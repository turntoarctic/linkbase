import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn 生成物依赖此文件（components.json utils 别名，06 §1.2） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
