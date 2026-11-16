import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_DISTRIBUTION_NAME,
  distributionDisplayName,
  distributionIsEditable,
  distributionTypeForRepository,
  distributionTypeFromHref,
  distributionTypeInfo,
  distributionTypeLabel,
  isSystemDistribution,
  publicationTypeLabel,
  uniqueDistributionDefaults,
} from "../../src/lib/distributions";
import {
  PLUGINS,
  repositoryRemoteFilterTypes,
  repositoryTypeLabel,
  repositoryTypeOptions,
} from "../../src/lib/plugins";
import {
  publicationResourceForRepositoryFromHref,
  repositoryAutopublishSupport,
  repositorySupportsAutopublishFromHref,
  repositorySupportsPublicationsFromHref,
} from "../../src/lib/repositories";

test("plugin registry exposes one definition per repository type", () => {
  const ids = PLUGINS.map((plugin) => plugin.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(repositoryTypeLabel("hugging_face"), "Hugging Face");
  assert.equal(repositoryTypeLabel("core"), "OpenPGP keyring");
  assert.equal(repositoryTypeOptions().length, PLUGINS.length);
});

test("repository capabilities derive from the registry", () => {
  assert.equal(
    repositorySupportsAutopublishFromHref(
      "/pulp/api/v3/repositories/file/file/00000000-0000-0000-0000-000000000000/",
    ),
    true,
  );
  assert.equal(
    repositorySupportsAutopublishFromHref(
      "/pulp/api/v3/repositories/container/container/00000000-0000-0000-0000-000000000000/",
    ),
    false,
  );
  assert.equal(
    repositorySupportsPublicationsFromHref(
      "/pulp/api/v3/repositories/gem/gem/00000000-0000-0000-0000-000000000000/",
    ),
    true,
  );
  assert.equal(
    publicationResourceForRepositoryFromHref(
      "/pulp/api/v3/repositories/python/python/00000000-0000-0000-0000-000000000000/",
    ),
    "publications/python/pypi/",
  );
  assert.equal(repositoryAutopublishSupport("python")?.deprecated, true);
});

test("distribution metadata resolves Python pypi and Debian apt endpoints", () => {
  const python = distributionTypeForRepository(
    "/pulp/api/v3/repositories/python/python/00000000-0000-0000-0000-000000000000/",
  );
  assert.equal(python?.resource, "distributions/python/pypi/");
  assert.deepEqual(python?.publicationTypes, ["python.pypi"]);

  const deb = distributionTypeForRepository(
    "/pulp/api/v3/repositories/deb/apt/00000000-0000-0000-0000-000000000000/",
  );
  assert.equal(deb?.label, "Debian APT");

  assert.equal(
    publicationTypeLabel("/pulp/api/v3/publications/deb/apt/00000000-0000-0000-0000-000000000000/"),
    "Debian APT",
  );

  assert.equal(
    distributionTypeLabel(
      "/pulp/api/v3/distributions/rpm/rpm/00000000-0000-0000-0000-000000000000/",
    ),
    "RPM",
  );
  assert.equal(
    distributionTypeLabel(
      "/pulp/api/v3/distributions/python/pypi/00000000-0000-0000-0000-000000000000/",
    ),
    "Python",
  );
  assert.equal(
    distributionTypeLabel(
      "/pulp/api/v3/distributions/core/artifacts/00000000-0000-0000-0000-000000000000/",
    ),
    "core.artifacts",
  );
});

test("remote compatibility is registry-driven", () => {
  assert.deepEqual(repositoryRemoteFilterTypes("deb"), ["deb.apt-remote"]);
  assert.deepEqual(repositoryRemoteFilterTypes("container"), ["container.container"]);
  assert.deepEqual(repositoryRemoteFilterTypes("unknown"), []);
});

test("unique distribution defaults avoid existing names and paths", () => {
  assert.deepEqual(uniqueDistributionDefaults("repo", []), {
    name: "repo",
    basePath: "repo",
  });
  assert.deepEqual(
    uniqueDistributionDefaults("repo", [
      { name: "repo", base_path: "repo" },
      { name: "repo-2", base_path: "repo-2" },
    ]),
    { name: "repo-3", basePath: "repo-3" },
  );
  assert.equal(uniqueDistributionDefaults("My Repo", []).basePath, "my-repo");
});

test("the core artifact distribution is a read-only system endpoint", () => {
  const systemHref =
    "/pulp/api/v3/distributions/core/artifacts/01a19bc1-8a86-7b9e-b6f6-1140a783338a/";
  const fileHref = "/pulp/api/v3/distributions/file/file/00000000-0000-0000-0000-000000000000/";

  assert.equal(isSystemDistribution(systemHref), true);
  assert.equal(isSystemDistribution(fileHref), false);
  assert.equal(isSystemDistribution(undefined), false);

  assert.equal(distributionIsEditable(systemHref), false);
  assert.equal(distributionIsEditable(fileHref), true);
  assert.equal(distributionIsEditable(undefined), false);

  assert.equal(distributionDisplayName("10f96ac4", systemHref), SYSTEM_DISTRIBUTION_NAME);
  assert.equal(distributionDisplayName("demo", fileHref), "demo");

  assert.equal(distributionTypeInfo(systemHref), undefined);
  assert.equal(distributionTypeFromHref(systemHref), "core.artifacts");
});
