import { getUncachableGitHubClient } from '../server/github';
import * as fs from 'fs';
import * as path from 'path';

const REPO_NAME = 'slumber-app';

const IGNORE_DIRS = new Set([
  'node_modules', '.expo', 'dist', 'web-build', 'ios', 'android',
  '.git', '.cache', '.local', 'static-build', '.replit', 'snippets',
  '__pycache__', '.config', '.upm', 'attached_assets',
]);

const IGNORE_FILES = new Set([
  '.replit', 'replit.nix', 'generated-icon.png',
]);

function getAllFiles(dir: string, base: string = ''): { path: string; fullPath: string }[] {
  const results: { path: string; fullPath: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...getAllFiles(full, rel));
    } else {
      if (IGNORE_FILES.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      results.push({ path: rel, fullPath: full });
    }
  }
  return results;
}

function isBinary(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.tar', '.gz', '.pdf', '.svg']);
  return binaryExts.has(ext);
}

async function waitForRepo(octokit: any, owner: string, repo: string, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
      if (ref.object.sha) return ref.object.sha;
    } catch {}
    console.log(`  Waiting for repo to initialize... (${i + 1}/${maxRetries})`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Repo failed to initialize');
}

async function main() {
  const octokit = await getUncachableGitHubClient();
  const { data: user } = await octokit.users.getAuthenticated();
  const owner = user.login;
  console.log(`Authenticated as: ${owner}`);

  let repoReady = false;
  try {
    await octokit.repos.get({ owner, repo: REPO_NAME });
    try {
      await octokit.git.getRef({ owner, repo: REPO_NAME, ref: 'heads/main' });
      console.log(`Repo ${owner}/${REPO_NAME} exists and has commits`);
      repoReady = true;
    } catch {
      console.log(`Repo exists but is empty, initializing with a seed file...`);
      await octokit.repos.createOrUpdateFileContents({
        owner, repo: REPO_NAME,
        path: 'README.md',
        message: 'Initial commit',
        content: Buffer.from('# Slumber\niOS sleep tracking app\n').toString('base64'),
      });
      console.log('Waiting for repo to be ready...');
      await waitForRepo(octokit, owner, REPO_NAME);
      repoReady = true;
    }
  } catch (e: any) {
    if (e.status === 404) {
      console.log(`Creating repo ${REPO_NAME}...`);
      await octokit.repos.createForAuthenticatedUser({
        name: REPO_NAME,
        private: true,
        description: 'Slumber — iOS sleep tracking app (Expo + React Native)',
      });
      await octokit.repos.createOrUpdateFileContents({
        owner, repo: REPO_NAME,
        path: 'README.md',
        message: 'Initial commit',
        content: Buffer.from('# Slumber\niOS sleep tracking app\n').toString('base64'),
      });
      console.log('Waiting for repo to be ready...');
      await waitForRepo(octokit, owner, REPO_NAME);
      repoReady = true;
    } else throw e;
  }

  const { data: ref } = await octokit.git.getRef({ owner, repo: REPO_NAME, ref: 'heads/main' });
  const parentSha = ref.object.sha;

  const rootDir = process.cwd();
  const files = getAllFiles(rootDir);
  console.log(`Found ${files.length} files to sync`);

  const blobs: { path: string; sha: string }[] = [];
  const BATCH = 5;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const promises = batch.map(async (f) => {
      try {
        const binary = isBinary(f.fullPath);
        const content = fs.readFileSync(f.fullPath, binary ? 'base64' : 'utf-8');

        const { data } = await octokit.git.createBlob({
          owner, repo: REPO_NAME,
          content,
          encoding: binary ? 'base64' : 'utf-8',
        });

        return { path: f.path, sha: data.sha };
      } catch (err: any) {
        console.warn(`  Skip ${f.path}: ${err.message}`);
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) blobs.push(r);
    }
    console.log(`  Uploaded ${Math.min(i + BATCH, files.length)}/${files.length}`);
  }

  console.log('Creating tree...');
  const { data: tree } = await octokit.git.createTree({
    owner, repo: REPO_NAME,
    tree: blobs.map(b => ({
      path: b.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: b.sha,
    })),
  });

  console.log('Creating commit...');
  const { data: commit } = await octokit.git.createCommit({
    owner, repo: REPO_NAME,
    message: 'Sync from Replit',
    tree: tree.sha,
    parents: [parentSha],
  });

  await octokit.git.updateRef({
    owner, repo: REPO_NAME,
    ref: 'heads/main',
    sha: commit.sha,
    force: true,
  });

  console.log('\n=== Sync complete! ===');
  console.log(`\nRepo: https://github.com/${owner}/${REPO_NAME}`);
  console.log(`\nFirst time? Clone it:`);
  console.log(`  git clone https://github.com/${owner}/${REPO_NAME}.git`);
  console.log(`\nAlready cloned? Just pull:`);
  console.log(`  cd ${REPO_NAME} && git pull`);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
