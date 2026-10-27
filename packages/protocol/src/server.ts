export type ServerInfo = {
  name: "pipit";
  version: string;
  pid: number;
  url: string;
  startedAt: string;
  configDir: string;
  /**
   * `<configDir>/queries` - the folder pipit made for itself. Where an untitled query goes when
   * no workspace folder is open, which is why the client is told about it rather than joining
   * paths itself: the separator is the server's business.
   */
  queriesDir: string;
};
