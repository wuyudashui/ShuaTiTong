const CATALOG_PATH = 'public/question-banks/catalog.json';
const BANK_DIR = 'public/question-banks';
const API_ROOT = 'https://api.github.com';

function githubConfig(env = process.env) {
  return {
    token: env.SHUATITONG_GITHUB_TOKEN || env.GITHUB_TOKEN || '',
    owner: env.SHUATITONG_GITHUB_OWNER || 'wuyudashui',
    repo: env.SHUATITONG_GITHUB_REPO || 'ShuaTiTong',
    branch: env.SHUATITONG_GITHUB_BRANCH || 'main',
  };
}

function configured(env = process.env) {
  return Boolean(env.SHUATITONG_GITHUB_TOKEN || env.GITHUB_TOKEN);
}

function encodePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

class GithubError extends Error {
  constructor(status = 502) {
    super(status === 409 ? 'GitHub 分支已被更新，请重试' : 'GitHub 请求失败');
    this.status = status;
  }
}

function createGithubClient(options = {}) {
  const config = { ...githubConfig(options.env || process.env), ...(options.config || {}) };
  const fetchImpl = options.fetch || globalThis.fetch;
  const repoPrefix = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  if (typeof fetchImpl !== 'function') throw new GithubError();

  async function request(apiPath, init = {}) {
    let response;
    try {
      response = await fetchImpl(`${API_ROOT}${apiPath}`, {
        ...init,
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new GithubError();
    }
    // Never include GitHub response bodies or network error messages in errors.
    if (!response.ok) {
      const conflict = init.method === 'PATCH' && [409, 422].includes(response.status);
      throw new GithubError(conflict ? 409 : response.status);
    }
    try { return await response.json(); } catch { throw new GithubError(); }
  }

  async function getCatalog(ref = config.branch) {
    let result;
    try {
      result = await request(`${repoPrefix}/contents/${encodePath(CATALOG_PATH)}?ref=${encodeURIComponent(ref)}`);
    } catch (error) {
      if (error.status === 404) return { version: 1, banks: [] };
      throw error;
    }
    try {
      if (typeof result.content !== 'string' || result.encoding !== 'base64') throw new Error();
      const catalog = JSON.parse(Buffer.from(result.content, 'base64').toString('utf8'));
      if (catalog.version !== 1 || !Array.isArray(catalog.banks)) throw new Error();
      return catalog;
    } catch { throw new GithubError(); }
  }

  async function preparePublication(filename) {
    const ref = await request(`${repoPrefix}/git/ref/heads/${encodeURIComponent(config.branch)}`);
    const parentSha = ref?.object?.sha;
    if (!parentSha) throw new GithubError();
    const commit = await request(`${repoPrefix}/git/commits/${encodeURIComponent(parentSha)}`);
    const baseTree = commit?.tree?.sha;
    if (!baseTree) throw new GithubError();
    const catalog = await getCatalog(parentSha);
    let existingFile = false;
    try {
      const entry = await request(`${repoPrefix}/contents/${encodePath(`${BANK_DIR}/${filename}`)}?ref=${encodeURIComponent(parentSha)}`);
      existingFile = Boolean(entry);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    return { parentSha, baseTree, catalog, existingFile };
  }

  async function publish({ filename, bankJson, catalog, snapshot, message }) {
    if (!snapshot?.parentSha || !snapshot?.baseTree) throw new GithubError();
    const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8').toString('base64');
    const blob = value => request(`${repoPrefix}/git/blobs`, {
      method: 'POST', body: JSON.stringify({ content: encoded(value), encoding: 'base64' }),
    });
    const [bankBlob, catalogBlob] = await Promise.all([blob(bankJson), blob(catalog)]);
    if (!bankBlob?.sha || !catalogBlob?.sha) throw new GithubError();
    // Both files enter the branch together through one tree, one commit and one
    // non-force ref update. Failure before the ref update leaves it untouched.
    const tree = await request(`${repoPrefix}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: snapshot.baseTree,
        tree: [
          { path: `${BANK_DIR}/${filename}`, mode: '100644', type: 'blob', sha: bankBlob.sha },
          { path: CATALOG_PATH, mode: '100644', type: 'blob', sha: catalogBlob.sha },
        ],
      }),
    });
    if (!tree?.sha) throw new GithubError();
    const commit = await request(`${repoPrefix}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [snapshot.parentSha] }),
    });
    if (!commit?.sha) throw new GithubError();
    await request(`${repoPrefix}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
      method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return { commitSha: commit.sha };
  }

  return { config, getCatalog, preparePublication, publish };
}

module.exports = { createGithubClient, githubConfig, configured, GithubError, CATALOG_PATH, BANK_DIR };
