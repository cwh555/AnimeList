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
