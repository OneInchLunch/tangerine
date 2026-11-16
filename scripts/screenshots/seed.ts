import type { PulpApi } from "../screenshots";
import type { DemoState, Resource } from "./types";
import { DEMO_PASSWORD, DEMO_ROLE } from "./constants";
import { sleep } from "./sleep";

export async function resetDemoData(api: PulpApi): Promise<void> {
  const repositories = await api.list<Resource>("/pulp/api/v3/repositories/?name__contains=demo-");
  const repositoryHrefs = new Set(repositories.map((item) => item.pulp_href));

  const publications = await api.list<{ pulp_href: string; repository?: string | null }>(
    "/pulp/api/v3/publications/",
  );
  for (const publication of publications) {
    if (publication.repository && repositoryHrefs.has(publication.repository)) {
      await api.deleteAndWait(publication.pulp_href);
    }
  }

  for (const distribution of await api.list<Resource>(
    "/pulp/api/v3/distributions/?name__contains=demo-",
  )) {
    await api.deleteAndWait(distribution.pulp_href);
  }

  for (const repository of repositories) {
    await api.deleteAndWait(repository.pulp_href);
  }

  for (const remote of await api.list<Resource>("/pulp/api/v3/remotes/?name__contains=demo-")) {
    await api.deleteAndWait(remote.pulp_href);
  }

  for (const group of await api.list<Resource>("/pulp/api/v3/groups/?name__contains=demo-")) {
    await api.deleteAndWait(group.pulp_href);
  }

  for (const user of await api.list<Resource>("/pulp/api/v3/users/?username__contains=demo-")) {
    await api.deleteAndWait(user.pulp_href);
  }

  for (const exporter of await api.list<Resource>(
    "/pulp/api/v3/exporters/core/pulp/?name__contains=demo-",
  )) {
    await api.deleteAndWait(exporter.pulp_href);
  }

  for (const importer of await api.list<Resource>(
    "/pulp/api/v3/importers/core/pulp/?name__contains=demo-",
  )) {
    await api.deleteAndWait(importer.pulp_href);
  }
}

export async function seedDemoData(api: PulpApi): Promise<DemoState> {
  console.log("Seeding demo data…");

  const fileRemote = await api.post<Resource>("/pulp/api/v3/remotes/file/file/", {
    name: "demo-file-remote",
    url: "https://fixtures.example.com/pulp/file/PULP_MANIFEST",
    policy: "on_demand",
  });

  await api.post<Resource>("/pulp/api/v3/remotes/rpm/rpm/", {
    name: "demo-rpm-remote",
    url: "https://mirror.example.com/rocky/9/BaseOS/x86_64/os/",
    policy: "on_demand",
  });

  const fileRepository = await api.post<Resource>("/pulp/api/v3/repositories/file/file/", {
    name: "demo-file-library",
    description: "Curated documentation fixtures served to internal tooling",
    remote: fileRemote.pulp_href,
    autopublish: true,
  });

  const rpmRepository = await api.post<Resource>("/pulp/api/v3/repositories/rpm/rpm/", {
    name: "demo-rpm-mirror",
    description: "Rocky Linux 9 BaseOS mirror used by build agents",
    autopublish: true,
  });

  await api.post<Resource>("/pulp/api/v3/repositories/python/python/", {
    name: "demo-python-index",
    description: "Internal Python package index",
  });

  const containerRepository = await api.post<Resource>(
    "/pulp/api/v3/repositories/container/container/",
    {
      name: "demo-container-images",
      description: "Container images published to the fleet",
    },
  );

  const fixtureFiles: [string, string][] = [
    ["demo/README.txt", "Tangerine documentation fixture\n"],
    ["demo/install.txt", "Install steps for the demo fixture\n"],
    ["demo/release-notes.txt", "Release notes for the demo fixture\n"],
    ["demo/architecture.txt", "How the demo fixture is assembled\n"],
    ["demo/operations.txt", "Operating the demo fixture\n"],
    ["demo/troubleshooting.txt", "Common problems and fixes\n"],
    ["demo/lifecycle.txt", "Retention and cleanup policy\n"],
    ["demo/support.txt", "Who to contact about the fixture\n"],
  ];
  const units: string[] = [];
  for (const [relativePath, contents] of fixtureFiles) {
    units.push(await api.uploadFile(relativePath, contents));
  }

  const modify = await api.post<{ task: string }>(`${fileRepository.pulp_href}modify/`, {
    add_content_units: units,
  });
  await api.waitForTask(modify.task);

  // Auto-publish runs inside the version-creation task; wait for the publication
  // so the distribution has something to serve before it is created.
  let publicationHref = "";
  for (let attempt = 0; attempt < 40 && !publicationHref; attempt += 1) {
    const page = await api.get<{ results: { pulp_href: string }[] }>(
      `/pulp/api/v3/publications/?repository=${encodeURIComponent(fileRepository.pulp_href)}`,
    );
    publicationHref = page.results[0]?.pulp_href ?? "";
    if (!publicationHref) {
      await sleep(500);
    }
  }

  const fileDistribution = await api.post<{ task?: string; pulp_href?: string }>(
    "/pulp/api/v3/distributions/file/file/",
    {
      name: "demo-file-dist",
      base_path: "demo-file-library",
      repository: fileRepository.pulp_href,
    },
  );
  const fileDistributionHref = fileDistribution.task
    ? ((await api.waitForTask(fileDistribution.task)).created_resources?.[0] ?? "")
    : (fileDistribution.pulp_href ?? "");

  const containerDistribution = await api.post<{ task?: string; pulp_href?: string }>(
    "/pulp/api/v3/distributions/container/container/",
    {
      name: "demo-container-dist",
      base_path: "demo/containers",
      repository: containerRepository.pulp_href,
    },
  );
  if (containerDistribution.task) {
    await api.waitForTask(containerDistribution.task);
  }

  const group = await api.post<Resource>("/pulp/api/v3/groups/", {
    name: "demo-platform-team",
  });

  const user = await api.post<Resource>("/pulp/api/v3/users/", {
    username: "demo-operator",
    password: DEMO_PASSWORD,
    email: "demo-operator@example.com",
    is_staff: false,
  });

  await api.post(`${group.pulp_href}users/`, { username: "demo-operator" });

  const roles = await api.get<{ results: { name: string; pulp_href: string }[] }>(
    `/pulp/api/v3/roles/?name=${encodeURIComponent(DEMO_ROLE)}`,
  );
  const role = roles.results[0];
  if (role) {
    await api.post(`${user.pulp_href}roles/`, { role: role.name, content_object: null });
  }

  await api.post("/pulp/api/v3/exporters/core/pulp/", {
    name: "demo-pulp-export",
    path: "/tmp/tangerine-demo-export",
    repositories: [fileRepository.pulp_href],
  });

  await api.post("/pulp/api/v3/importers/core/pulp/", {
    name: "demo-pulp-import",
  });

  console.log("Demo data ready.");

  return {
    fileRepository: "demo-file-library",
    fileRepositoryHref: fileRepository.pulp_href,
    rpmRepositoryHref: rpmRepository.pulp_href,
    fileRemoteHref: fileRemote.pulp_href,
    fileDistributionHref,
    filePublicationHref: publicationHref,
    seedTaskHref: modify.task,
    username: "demo-operator",
    groupName: "demo-platform-team",
    exporterName: "demo-pulp-export",
    importerName: "demo-pulp-import",
  };
}

/** Disable auto-publish and create an unpublished version so the publish dialog is reachable. */
export async function prepareUnpublishedVersion(api: PulpApi): Promise<void> {
  const repositories = await api.list<{ pulp_href: string; name: string }>(
    "/pulp/api/v3/repositories/?name__contains=demo-file-library",
  );
  const repository = repositories[0];
  if (!repository) {
    throw new Error("demo-file-library is missing");
  }

  await api.patch(repository.pulp_href, { autopublish: false });
  const unit = await api.uploadFile("demo/CHANGELOG.txt", "Unpublished changelog fixture\n");
  const modify = await api.post<{ task: string }>(`${repository.pulp_href}modify/`, {
    add_content_units: [unit],
  });
  await api.waitForTask(modify.task);
}

/** Publish the newest version again and re-enable auto-publish after a demo. */
export async function restorePublishedState(api: PulpApi, state: DemoState): Promise<void> {
  const repositories = await api.list<{ pulp_href: string; latest_version_href?: string | null }>(
    `/pulp/api/v3/repositories/file/file/?name=${encodeURIComponent(state.fileRepository)}`,
  );
  const repository = repositories[0];
  if (!repository) {
    return;
  }

  if (repository.latest_version_href) {
    const publication = await api.post<{ task?: string }>("/pulp/api/v3/publications/file/file/", {
      repository_version: repository.latest_version_href,
    });
    if (publication.task) {
      await api.waitForTask(publication.task);
    }
  }

  await api.patch(repository.pulp_href, { autopublish: true });
}
