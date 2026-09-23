// Thin, typed re-export so components import from one place and we can
// swap/mocking in tests later without touching every component.
export const buddy = () => window.buddy
