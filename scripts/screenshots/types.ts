import type { BrowserContext, Page } from "@playwright/test";
import type { PulpApi } from "../screenshots";

export interface CliOptions {
  baseURL: string;
  apiURL: string;
  username: string;
  password: string;
  outDir: string;
  only: string | null;
  keep: boolean;
  list: boolean;
}

export interface DemoState {
  fileRepository: string;
  fileRepositoryHref: string;
  rpmRepositoryHref: string;
  fileRemoteHref: string;
  fileDistributionHref: string;
  filePublicationHref: string;
  seedTaskHref: string;
  username: string;
  groupName: string;
  exporterName: string;
  importerName: string;
}

export interface Resource {
  pulp_href: string;
  name?: string;
  username?: string;
}

export type CDPSessionLike = Awaited<ReturnType<BrowserContext["newCDPSession"]>>;

export interface Capture {
  page: Page;
  cdp: CDPSessionLike;
  outDir: string;
}

export interface Shot {
  name: string;
  run: (args: {
    page: Page;
    baseURL: string;
    api: PulpApi;
    state: DemoState;
    capture: Capture;
  }) => Promise<void>;
}
