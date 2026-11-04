/** No session, or one the database no longer accepts. */
export class UnauthorizedError extends Error {
  constructor() {
    super('not signed in');
    this.name = 'UnauthorizedError';
  }
}
