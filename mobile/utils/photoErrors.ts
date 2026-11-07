/** A picked photo couldn't be read or cropped (as opposed to an upload failing). */
export class PhotoReadError extends Error {
  constructor(cause?: unknown) {
    super("Couldn't read that photo.");
    this.name = 'PhotoReadError';
    (this as any).cause = cause;
  }
}
