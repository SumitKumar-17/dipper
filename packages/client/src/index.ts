// The public surface. A frontend imports this and nothing else about the server.

export { createClient, type PipitClient } from "./client";
export {
  NETWORK,
  NOT_API,
  PipitError,
  connectFailureCode,
  isNetworkError,
  isNotApiError,
  isPipitError,
  staleWrite,
  type ApiErrorBody,
  type PipitErrorInit,
  type StaleWriteBody,
} from "./errors";
export {
  createTransport,
  joinUrl,
  type CallOptions,
  type ClientOptions,
  type FetchLike,
  type QueryParams,
  type RequestOptions,
  type Transport,
} from "./http";
export { readLines, readNdjson } from "./ndjson";
export { readSse } from "./sse";
export type {
  ConnectionInput,
  ConnectionsApi,
  ConnectionTest,
  NewConnection,
  SchemaOptions,
} from "./connections";
export { browseApi, type BrowseApi, type BrowseOptions } from "./browse";
export type { DiscoverApi, DiscoverOptions } from "./discover";
export type { QueryApi, RunInput } from "./query";
export type { ExportOptions, RunsApi } from "./runs";
export type { HistoryApi, HistoryOptions } from "./history";
export type { SettingsApi } from "./settings";
export type { FileContent, FilesApi, FileWritten, WriteInput } from "./files";
export type { EventsApi } from "./events";

// Re-exported so a consumer never needs a second import for the wire types.
export type * from "@pipit/protocol";
