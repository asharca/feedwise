import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function proxyImg(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
