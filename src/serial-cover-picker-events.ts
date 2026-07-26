interface DisposablePlugin {
  register(callback: () => void): void;
}

function isElementNode(value: Node): value is Element {
  return value.nodeType === 1;
}

function elementTarget(value: EventTarget | null): Element | null {
  if (!value || !("nodeType" in value)) return null;
  const node = value as Node;
  return isElementNode(node) ? node : null;
}

function selectorModal(target: Element | null): HTMLElement | null {
  return target?.closest<HTMLElement>(".al-serial-cover-modal") ?? null;
}

export function synchronizeSerialCoverApply(modal: HTMLElement): void {
  const input = modal.querySelector<HTMLInputElement>('.al-modal-search-row input[type="search"]');
  const selected = modal.querySelector<HTMLElement>(".al-search-result.is-selected");
  const apply = modal.querySelector<HTMLButtonElement>(".al-modal-actions > button.mod-cta");
  if (!input || input.disabled || !selected || !apply || !apply.disabled) return;
  apply.disabled = false;
}

function activateSerialCoverChoice(target: Element): boolean {
  const select = target.closest<HTMLElement>(".al-serial-cover-modal .al-search-result-use");
  const row = select?.closest<HTMLButtonElement>("button.al-search-result");
  if (!select || !row || row.disabled) return false;
  row.click();
  const modal = selectorModal(row);
  if (modal) queueMicrotask(() => synchronizeSerialCoverApply(modal));
  return true;
}

function prepareSelectAffordances(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".al-serial-cover-modal .al-search-result-use").forEach((select) => {
    if (!select.hasAttribute("role")) select.setAttribute("role", "button");
    if (!select.hasAttribute("tabindex")) select.tabIndex = 0;
  });
  root.querySelectorAll<HTMLElement>(".al-serial-cover-modal").forEach(synchronizeSerialCoverApply);
}

export function installSerialCoverPickerEvents(plugin: DisposablePlugin): void {
  const handleClick = (event: MouseEvent): void => {
    const target = elementTarget(event.target);
    if (!target || !target.closest(".al-serial-cover-modal .al-search-result-use")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activateSerialCoverChoice(target);
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = elementTarget(event.target);
    if (!target || !target.closest(".al-serial-cover-modal .al-search-result-use")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activateSerialCoverChoice(target);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (isElementNode(node)) prepareSelectAffordances(node);
      }
      const modal = isElementNode(record.target) ? selectorModal(record.target) : null;
      if (modal) synchronizeSerialCoverApply(modal);
    }
  });

  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeydown, true);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "disabled"],
  });
  prepareSelectAffordances(document);

  plugin.register(() => {
    observer.disconnect();
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKeydown, true);
  });
}
