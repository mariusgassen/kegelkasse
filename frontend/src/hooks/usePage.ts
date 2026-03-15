import { useState } from 'react'

/** Simple page state hook — could be swapped for a router later */
export function usePage<T extends string>(initial: T): [T, (p: T) => void] {
  return useState<T>(initial)
}
