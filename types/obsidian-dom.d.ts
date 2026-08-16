declare global {
  interface HTMLElement {
    setCssStyles(styles: Partial<CSSStyleDeclaration>): void;
  }
}

export {};
