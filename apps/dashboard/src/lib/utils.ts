import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS classes with proper precedence using clsx and tailwind-merge.
 * @param inputs - Class values to merge (strings, objects, arrays)
 * @returns Merged class string with conflicting Tailwind classes resolved
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number with locale-aware formatting.
 * @param value - The number to format
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted number string (e.g. "1,234.56")
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Formats a date string or timestamp into a human-readable format.
 * @param date - Date string, timestamp (ms), or Date object
 * @returns Formatted date string (e.g. "Jan 15, 2024, 10:30 AM")
 */
export function formatDate(date: string | number | Date): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formats a byte count into a human-readable string.
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted size string (e.g. "1.5 MB")
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}
