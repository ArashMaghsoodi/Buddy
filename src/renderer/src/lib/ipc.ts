// Thin, typed re-export so components import from one place and we can
// swap/mocking in tests later without touching every component.
/// <reference path="../../../preload/index.d.ts" />

export const buddy = () => window.buddy
