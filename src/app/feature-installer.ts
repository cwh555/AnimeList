export interface FeatureInstaller<PluginHost> {
  readonly id: string;
  install(plugin: PluginHost): void | Promise<void>;
}

export async function installFeatureSet<PluginHost>(
  plugin: PluginHost,
  installers: readonly FeatureInstaller<PluginHost>[],
): Promise<void> {
  const seen = new Set<string>();

  for (const installer of installers) {
    if (seen.has(installer.id)) {
      throw new Error(`Duplicate feature installer: ${installer.id}`);
    }
    seen.add(installer.id);
  }

  for (const installer of installers) {
    await installer.install(plugin);
  }
}
