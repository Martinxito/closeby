// Vitest runs outside React Server Components, where the real `server-only` package
// throws on import. Tests of server-only modules alias it to this empty module.
export {};
