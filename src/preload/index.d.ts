import type { BuddyApi } from './index'

declare global {
  interface Window {
    buddy: BuddyApi
  }
}
