import { bindImageFallback } from "./image-fallback";
import { makeEl } from "./ui-helpers";

export interface MediaEditorIdentity {
  title: string;
  originalTitle?: string;
  provider?: string;
  coverUrl?: string;
  coverAlt: string;
  missingCoverText: string;
}

/** Identical section titles across collection and saved-note editing. */
export function createMediaEditorSectionHeading(label: string): HTMLHeadingElement {
  return makeEl("h3", "al-form-section-heading al-edit-form-heading", label);
}

/** The same DOM nodes survive optional provider enrichment, preventing image reload/flicker. */
export function updateMediaEditorIdentityTitle(hero: HTMLElement, title: string, coverAlt: string): void {
  const heading = hero.querySelector<HTMLHeadingElement>(".al-media-editor-identity-title");
  if (heading) heading.textContent = title;
  const image = hero.querySelector<HTMLImageElement>(".al-media-editor-identity-cover img");
  if (image) image.alt = coverAlt;
}

/** One identity header for external-result creation and stored-note editing. */
export function createMediaEditorIdentity(identity: MediaEditorIdentity): HTMLElement {
  const hero = makeEl("section", "al-selected-preview al-media-editor-identity");
  const cover = makeEl("div", "al-media-editor-identity-cover");
  if (identity.coverUrl) {
    const image = makeEl("img");
    image.alt = identity.coverAlt;
    bindImageFallback(image, () => makeEl("span", "al-search-result-placeholder", identity.missingCoverText));
    cover.appendChild(image);
    image.src = identity.coverUrl;
  } else {
    cover.appendChild(makeEl("span", "al-search-result-placeholder", identity.missingCoverText));
  }
  const copy = makeEl("div", "al-media-editor-identity-copy");
  if (identity.provider) copy.appendChild(makeEl("div", "al-kicker", identity.provider));
  copy.appendChild(makeEl("h2", "al-media-editor-identity-title", identity.title));
  if (identity.originalTitle && identity.originalTitle !== identity.title) {
    copy.appendChild(makeEl("p", "al-media-editor-identity-original", identity.originalTitle));
  }
  hero.append(cover, copy);
  return hero;
}
