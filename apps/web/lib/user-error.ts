// Messages shown to users must be Chilean Spanish with no technical or crypto words
// (docs/product.md). Only a UserError's message reaches the screen; any other error
// (network failure, library error in English, unexpected server reply) becomes a
// generic Spanish message.

/** An error whose message was written for the user and can be shown as is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export function friendlyMessage(err: unknown, fallback = 'Algo salió mal. Intenta de nuevo.'): string {
  if (err instanceof UserError) return err.message;
  // fetch() rejects with a TypeError when the network is down.
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.';
  }
  if (err instanceof Error) console.error(err);
  return fallback;
}
