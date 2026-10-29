/** Validation/lookup failure with the HTTP status to answer with. Kept free of server imports so client code can share it. */
export class CatalogError extends Error {
  constructor(message: string, public readonly httpStatus: 400 | 404 | 409 = 400) {
    super(message);
  }
}
