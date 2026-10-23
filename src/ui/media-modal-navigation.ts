/**
 * A single lifetime counter for search, manual creation and selected-media
 * detail screens. Every page transition invalidates all pending async work.
 * Network calls may still finish, but can never repaint an abandoned screen.
 */
export class MediaModalNavigation {
  private generation = 0;

  enter(): number {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(token: number): boolean {
    return token === this.generation;
  }
}
