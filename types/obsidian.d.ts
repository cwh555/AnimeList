declare global {
  interface HTMLElement {
    empty(): void;
    createDiv(options?: string | DomElementInfo): HTMLDivElement;
    createSpan(options?: string | DomElementInfo): HTMLSpanElement;
    createEl<K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | DomElementInfo): HTMLElementTagNameMap[K];
    addClass(...classes: string[]): void;
    removeClass(...classes: string[]): void;
    toggleClass(className: string, value?: boolean): void;
    setText(text: string): void;
  }

  interface DomElementInfo {
    cls?: string;
    text?: string;
    attr?: Record<string, string>;
    type?: string;
    value?: string;
  }

  function createEl<K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | DomElementInfo): HTMLElementTagNameMap[K];
  function createDiv(options?: string | DomElementInfo): HTMLDivElement;
  function createSpan(options?: string | DomElementInfo): HTMLSpanElement;
}

declare module "obsidian" {
  export interface RequestUrlParam {
    url: string;
    method?: string;
    contentType?: string;
    body?: string | ArrayBuffer;
    headers?: Record<string, string>;
    throw?: boolean;
  }

  export interface RequestUrlResponse {
    status: number;
    headers: Record<string, string>;
    arrayBuffer: ArrayBuffer;
    json: unknown;
    text: string;
  }

  export type EventRef = object;

  export class Component {
    addChild<T extends Component>(component: T): T;
    removeChild<T extends Component>(component: T): T;
    register(callback: () => void): void;
    registerEvent(eventRef: EventRef): void;
    registerDomEvent<K extends keyof DocumentEventMap>(
      element: Document,
      type: K,
      callback: (event: DocumentEventMap[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    registerDomEvent<K extends keyof WindowEventMap>(
      element: Window,
      type: K,
      callback: (event: WindowEventMap[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    registerDomEvent<K extends keyof HTMLElementEventMap>(
      element: HTMLElement,
      type: K,
      callback: (event: HTMLElementEventMap[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }

  export class MarkdownRenderChild extends Component {
    containerEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    onload(): void;
    onunload(): void;
  }

  export class TAbstractFile {
    path: string;
    name: string;
    parent: TFolder | null;
  }

  export class TFile extends TAbstractFile {
    basename: string;
    extension: string;
    stat: { ctime: number; mtime: number; size: number };
  }

  export class TFolder extends TAbstractFile {
    children: TAbstractFile[];
  }

  export interface WorkspaceLeafState {
    type: string;
    active?: boolean;
    state?: Record<string, unknown>;
  }

  export class WorkspaceLeaf {
    view: ItemView;
    setViewState(state: WorkspaceLeafState): Promise<void>;
    getViewState(): WorkspaceLeafState;
  }

  export interface CachedMetadata {
    frontmatter?: Record<string, unknown>;
  }

  export interface DataAdapterStat {
    type: "file" | "folder";
    ctime: number;
    mtime: number;
    size: number;
  }

  export interface DataAdapter {
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    list(path: string): Promise<{ files: string[]; folders: string[] }>;
    stat(path: string): Promise<DataAdapterStat | null>;
    readBinary(path: string): Promise<ArrayBuffer>;
    writeBinary(path: string, data: ArrayBuffer): Promise<void>;
    remove(path: string): Promise<void>;
    getResourcePath(path: string): string;
  }

  export interface Vault {
    configDir: string;
    adapter: DataAdapter;
    getRoot(): TFolder;
    getAbstractFileByPath(path: string): TAbstractFile | null;
    create(path: string, data: string): Promise<TFile>;
    createBinary(path: string, data: ArrayBuffer): Promise<TFile>;
    createFolder(path: string): Promise<TFolder>;
    cachedRead(file: TFile): Promise<string>;
    read(file: TFile): Promise<string>;
    modify(file: TFile, data: string): Promise<void>;
    delete(file: TAbstractFile, force?: boolean): Promise<void>;
    trash(file: TAbstractFile, system: boolean): Promise<void>;
    getResourcePath(file: TFile): string;
    on(name: string, callback: (...args: unknown[]) => void): EventRef;
  }

  export interface Workspace {
    getLeavesOfType(type: string): WorkspaceLeaf[];
    getLeaf(newLeaf?: string | boolean): WorkspaceLeaf;
    revealLeaf(leaf: WorkspaceLeaf): void;
    openLinkText(linktext: string, sourcePath: string, newLeaf?: boolean): Promise<void>;
  }

  export interface MetadataCache {
    getFileCache(file: TFile): CachedMetadata | null;
    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null;
    on(name: string, callback: (...args: unknown[]) => void): EventRef;
  }

  export interface FileManager {
    processFrontMatter(file: TFile, callback: (frontmatter: Record<string, unknown>) => void): Promise<void>;
    trashFile(file: TFile): Promise<void>;
  }

  export class App {
    vault: Vault;
    workspace: Workspace;
    metadataCache: MetadataCache;
    fileManager: FileManager;
  }

  export interface MarkdownPostProcessorContext {
    sourcePath: string;
    addChild(child: MarkdownRenderChild): void;
  }

  export interface Command {
    id: string;
    name: string;
    callback: () => void | Promise<void>;
  }

  export interface PluginManifest {
    id: string;
    name: string;
    version: string;
  }

  export class Plugin extends Component {
    app: App;
    manifest: PluginManifest;
    registerView(type: string, creator: (leaf: WorkspaceLeaf) => ItemView): void;
    registerMarkdownCodeBlockProcessor(
      language: string,
      processor: (source: string, element: HTMLElement, context: MarkdownPostProcessorContext) => void,
    ): void;
    registerEvent(eventRef: EventRef): void;
    addRibbonIcon(icon: string, title: string, callback: (event: MouseEvent) => void): HTMLElement;
    addCommand(command: Command): Command;
    addSettingTab(settingTab: PluginSettingTab): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
  }

  export class ItemView extends Component {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void> | void;
    onClose(): Promise<void> | void;
  }

  export class Modal {
    app: App;
    contentEl: HTMLElement;
    modalEl: HTMLElement;
    titleEl: HTMLElement;
    constructor(app: App);
    open(): void;
    close(): void;
    onOpen(): void;
    onClose(): void;
    setTitle(title: string): this;
  }

  export class Notice {
    constructor(message: string | DocumentFragment, timeout?: number);
    hide(): void;
    setMessage(message: string | DocumentFragment): this;
  }

  export interface SettingDefinition {
    name: string;
    desc?: string | DocumentFragment;
    aliases?: string[];
    visible?: () => boolean;
    render?: (setting: Setting) => void;
  }

  export class PluginSettingTab {
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    getSettingDefinitions(): SettingDefinition[];
    display(): void;
    update(): void;
    hide(): void;
  }

  export class TextComponent {
    inputEl: HTMLInputElement;
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => void | Promise<void>): this;
  }

  export class TextAreaComponent {
    inputEl: HTMLTextAreaElement;
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => void | Promise<void>): this;
  }

  export class DropdownComponent {
    selectEl: HTMLSelectElement;
    addOption(value: string, display: string): this;
    addOptions(options: Record<string, string>): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => void | Promise<void>): this;
  }

  export class ToggleComponent {
    toggleEl: HTMLElement;
    setValue(value: boolean): this;
    onChange(callback: (value: boolean) => void | Promise<void>): this;
  }

  export class ButtonComponent {
    buttonEl: HTMLButtonElement;
    setButtonText(value: string): this;
    setIcon(icon: string): this;
    setTooltip(tooltip: string): this;
    setCta(): this;
    setWarning(): this;
    onClick(callback: (event: MouseEvent) => void | Promise<void>): this;
  }

  export class Setting {
    settingEl: HTMLElement;
    nameEl: HTMLElement;
    descEl: HTMLElement;
    controlEl: HTMLElement;
    constructor(containerEl: HTMLElement);
    setName(name: string | DocumentFragment): this;
    setDesc(desc: string | DocumentFragment): this;
    setHeading(): this;
    addText(callback: (component: TextComponent) => void): this;
    addTextArea(callback: (component: TextAreaComponent) => void): this;
    addDropdown(callback: (component: DropdownComponent) => void): this;
    addToggle(callback: (component: ToggleComponent) => void): this;
    addButton(callback: (component: ButtonComponent) => void): this;
  }

  export function normalizePath(path: string): string;
  export function requestUrl(request: RequestUrlParam | string): Promise<RequestUrlResponse>;
  export function setIcon(parent: HTMLElement, iconId: string): void;
}

export {};
