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
    let fileEntry = null;
    try {
      fileEntry = await request(`${repoPrefix}/contents/${encodePath(`${BANK_DIR}/${filename}`)}?ref=${encodeURIComponent(parentSha)}`);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    return { parentSha, baseTree, catalog, existingFile: Boolean(fileEntry), fileEntry };
  }

  async function getBank(filename) {
    const snapshot = await preparePublication(filename);
    const bank = snapshot.catalog.banks.find(entry => entry && entry.filename === filename);
    if (!bank || !snapshot.existingFile) throw new GithubError(404);
    let source = snapshot.fileEntry;
    // The Contents endpoint omits inline content for files over 1 MiB. Read the
    // immutable blob SHA rather than a download URL pointing at a moving branch.
    if (source?.encoding !== 'base64' || typeof source.content !== 'string' || !source.content) {
      if (!source?.sha) throw new GithubError();
      source = await request(`${repoPrefix}/git/blobs/${encodeURIComponent(source.sha)}`);
    }
    try {
      if (source.encoding !== 'base64' || typeof source.content !== 'string') throw new Error();
      const bytes = Buffer.from(source.content, 'base64');
      if (bytes.length > 8 * 1024 * 1024) throw new Error();
      const questions = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
      if (!Array.isArray(questions) || !questions.length) throw new Error();
      return { bank, questions, version: snapshot.parentSha };
    } catch { throw new GithubError(); }
  }

  async function publish({ filename, bankJson, deleteBank = false, catalog, snapshot, message }) {
    if (!snapshot?.parentSha || !snapshot?.baseTree) throw new GithubError();
    if (deleteBank && bankJson !== undefined) throw new GithubError();
    const encoded = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8').toString('base64');
    const blob = value => request(`${repoPrefix}/git/blobs`, {
      method: 'POST', body: JSON.stringify({ content: encoded(value), encoding: 'base64' }),
    });
    const treeEntries = [];
    let catalogBlob;
    if (bankJson !== undefined) {
      const [bankBlob, createdCatalogBlob] = await Promise.all([blob(bankJson), blob(catalog)]);
      if (!bankBlob?.sha) throw new GithubError();
      catalogBlob = createdCatalogBlob;
      treeEntries.push({ path: `${BANK_DIR}/${filename}`, mode: '100644', type: 'blob', sha: bankBlob.sha });
    } else {
      catalogBlob = await blob(catalog);
      if (deleteBank) treeEntries.push({ path: `${BANK_DIR}/${filename}`, mode: '100644', type: 'blob', sha: null });
    }
    if (!catalogBlob?.sha) throw new GithubError();
    treeEntries.push({ path: CATALOG_PATH, mode: '100644', type: 'blob', sha: catalogBlob.sha });
    // Metadata edits retain the bank blob from base_tree unchanged. Publication
    // and deletion update both files through one tree, commit and non-force ref.
    const tree = await request(`${repoPrefix}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: snapshot.baseTree,
        tree: treeEntries,
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

  return { config, getCatalog, getBank, preparePublication, publish };
}

module.exports = { createGithubClient, githubConfig, configured, GithubError, CATALOG_PATH, BANK_DIR };
