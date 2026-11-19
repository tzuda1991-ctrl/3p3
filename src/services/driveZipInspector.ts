import JSZip from 'jszip';

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  md5Checksum?: string;
}

export interface ZipEntryInfo {
  path: string;
  name: string;
  isDir: boolean;
  extension: string;
  category: 'code' | 'config' | 'doc' | 'image' | 'archive' | 'binary';
  uncompressedSize: number;
  date: Date;
  comment: string;
  isImportant: boolean;
  isSuspicious: boolean;
  suspiciousReason?: string;
  textPreview?: string;
  isText: boolean;
}

export interface ZipDiagnosticFinding {
  level: 'healthy' | 'info' | 'warning' | 'alert';
  title: string;
  detail: string;
}

export interface ZipInspectionReport {
  driveFile: DriveFileMeta;
  status: 'pending' | 'downloading' | 'inspecting' | 'completed' | 'error';
  errorMessage?: string;
  compressedBytes: number;
  totalUncompressedBytes: number;
  fileCount: number;
  folderCount: number;
  entries: ZipEntryInfo[];
  extensionBreakdown: Record<string, { count: number; bytes: number }>;
  categoryBreakdown: Record<string, { count: number; bytes: number }>;
  detectedProjectTypes: string[];
  importantFiles: ZipEntryInfo[];
  diagnostics: ZipDiagnosticFinding[];
  zipInstance?: JSZip;
}

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'java', 'kt', 'kts', 'swift',
  'go', 'rs', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'dart', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'sql', 'sh', 'bash', 'zsh',
  'ps1', 'bat', 'cmd', 'lua', 'r', 'scala', 'clj', 'ex', 'exs'
]);

const CONFIG_EXTS = new Set([
  'json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'env', 'conf', 'cfg', 'lock',
  'gradle', 'properties', 'plist', 'dockerfile', 'gitignore', 'npmrc', 'babelrc',
  'eslintrc', 'prettierrc', 'editorconfig'
]);

const DOC_EXTS = new Set([
  'md', 'markdown', 'txt', 'rst', 'csv', 'tsv', 'log', 'pdf', 'doc', 'docx'
]);

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'tiff'
]);

const ARCHIVE_EXTS = new Set([
  'zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz', 'jar', 'war', 'apk', 'aab', 'ipa'
]);

const IMPORTANT_FILENAMES = new Set([
  'package.json',
  'readme.md',
  'readme.txt',
  'readme',
  'requirements.txt',
  'pyproject.toml',
  'cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'androidmanifest.xml',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.mjs',
  'index.html',
  'main.py',
  'app.py',
  'index.js',
  'index.ts',
  'server.js',
  'server.ts',
  '.env',
  '.env.example',
  'metadata.json',
  'manifest.json',
  'composer.json',
  'gemfile',
  'makefile',
  'cmakelists.txt',
  'pubspec.yaml',
]);

export function parseDriveFolderId(input: string): string {
  const trimmed = input.trim();
  // Match /folders/ID or id=ID
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }
  return trimmed;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isZipFile(file: DriveFileMeta): boolean {
  const lowerName = file.name.toLowerCase();
  const zipMimes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'multipart/x-zip',
  ];
  return (
    zipMimes.includes(file.mimeType) ||
    lowerName.endsWith('.zip') ||
    lowerName.endsWith('.jar') ||
    lowerName.endsWith('.apk') ||
    lowerName.endsWith('.aab')
  );
}

function getFileExtension(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  if (lower.startsWith('.env')) return 'env';
  const parts = lower.split('.');
  if (parts.length <= 1) return 'no-ext';
  return parts[parts.length - 1];
}

function classifyExtension(ext: string, filename: string): {
  category: ZipEntryInfo['category'];
  isText: boolean;
} {
  const lowerName = filename.toLowerCase();
  if (CODE_EXTS.has(ext)) return { category: 'code', isText: true };
  if (CONFIG_EXTS.has(ext) || IMPORTANT_FILENAMES.has(lowerName)) {
    return { category: 'config', isText: true };
  }
  if (DOC_EXTS.has(ext)) {
    const isTextDoc = !['pdf', 'doc', 'docx'].includes(ext);
    return { category: 'doc', isText: isTextDoc };
  }
  if (IMAGE_EXTS.has(ext)) {
    return { category: 'image', isText: ext === 'svg' };
  }
  if (ARCHIVE_EXTS.has(ext)) return { category: 'archive', isText: false };
  return { category: 'binary', isText: false };
}

function checkSuspiciousEntry(path: string, ext: string): {
  isSuspicious: boolean;
  reason?: string;
} {
  const lowerPath = path.toLowerCase();
  const baseName = lowerPath.split('/').pop() || '';

  if (
    lowerPath.includes('.env') &&
    !lowerPath.endsWith('.env.example') &&
    !lowerPath.endsWith('.env.sample') &&
    !lowerPath.endsWith('.env.template')
  ) {
    return {
      isSuspicious: true,
      reason: 'Environment file (.env) detected — check for exposed API keys or secrets',
    };
  }
  if (
    baseName.includes('secret') ||
    baseName.includes('credential') ||
    baseName.includes('service-account') ||
    baseName.endsWith('.pem') ||
    baseName.endsWith('.key') ||
    baseName.endsWith('.p12') ||
    baseName.endsWith('.jks') ||
    baseName.endsWith('.keystore')
  ) {
    return {
      isSuspicious: true,
      reason: 'Keystore, private key, or credential file detected inside archive',
    };
  }
  if (['exe', 'dll', 'so', 'dylib', 'msi', 'scr', 'vbs'].includes(ext)) {
    return {
      isSuspicious: true,
      reason: `Compiled executable or binary library (.${ext}) inside archive`,
    };
  }
  return { isSuspicious: false };
}

export async function fetchFolderMetadata(
  folderId: string,
  accessToken: string
): Promise<DriveFileMeta | null> {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    folderId
  )}?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,webViewLink`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return null;
  }
  return await res.json();
}

export async function listFolderContents(
  folderId: string,
  accessToken: string
): Promise<DriveFileMeta[]> {
  const allFiles: DriveFileMeta[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const q = `'${folderId}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q,
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,md5Checksum)',
      orderBy: 'folder,name',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      let errDetail = `${res.status} ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) {
          errDetail = errJson.error.message;
        }
      } catch {
        // ignore JSON parse error
      }
      throw new Error(`Google Drive API error: ${errDetail}`);
    }

    const data = await res.json();
    if (Array.isArray(data.files)) {
      allFiles.push(...data.files);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

export async function inspectZipFromDrive(
  driveFile: DriveFileMeta,
  accessToken: string
): Promise<ZipInspectionReport> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    driveFile.id
  )}?alt=media&supportsAllDrives=true`;

  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    let errText = `${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) errText = errJson.error.message;
    } catch {
      // ignore
    }
    throw new Error(`Failed to download ${driveFile.name}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return await inspectZipArrayBuffer(driveFile, arrayBuffer);
}

export async function inspectZipArrayBuffer(
  driveFile: DriveFileMeta,
  arrayBuffer: ArrayBuffer
): Promise<ZipInspectionReport> {
  const compressedBytes = arrayBuffer.byteLength;
  let zip: JSZip | undefined;
  let isTruncatedRecovery = false;

  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch {
    // Fallback: Recover local PK\x03\x04 headers from truncated/corrupted ZIP
    isTruncatedRecovery = true;
  }

  const entries: ZipEntryInfo[] = [];
  const extensionBreakdown: Record<string, { count: number; bytes: number }> = {};
  const categoryBreakdown: Record<string, { count: number; bytes: number }> = {
    code: { count: 0, bytes: 0 },
    config: { count: 0, bytes: 0 },
    doc: { count: 0, bytes: 0 },
    image: { count: 0, bytes: 0 },
    archive: { count: 0, bytes: 0 },
    binary: { count: 0, bytes: 0 },
  };

  let totalUncompressedBytes = 0;
  let fileCount = 0;
  let folderCount = 0;
  let hasNodeModules = false;
  let hasGitFolder = false;
  let hasMacOsCruft = false;
  let hasBuildFolder = false;

  const pathsLower = new Set<string>();

  if (zip && !isTruncatedRecovery) {
    const zipObjects = Object.values(zip.files);
    for (const zipObj of zipObjects) {
      const path = zipObj.name;
      const isDir = zipObj.dir;
      const parts = path.split('/').filter(Boolean);
      const name = parts[parts.length - 1] || path;

      if (path.includes('node_modules/')) hasNodeModules = true;
      if (path.includes('.git/')) hasGitFolder = true;
      if (path.includes('__MACOSX/') || name === '.DS_Store') hasMacOsCruft = true;
      if (path.startsWith('dist/') || path.startsWith('build/') || path.includes('/dist/') || path.includes('/build/')) {
        hasBuildFolder = true;
      }

      if (isDir) {
        folderCount++;
        entries.push({
          path,
          name,
          isDir: true,
          extension: 'folder',
          category: 'config',
          uncompressedSize: 0,
          date: zipObj.date,
          comment: zipObj.comment || '',
          isImportant: false,
          isSuspicious: false,
          isText: false,
        });
        continue;
      }

      fileCount++;
      pathsLower.add(path.toLowerCase());

      const internalData = (zipObj as unknown as { _data?: { uncompressedSize?: number } })._data;
      const uncompressedSize =
        typeof internalData?.uncompressedSize === 'number' && internalData.uncompressedSize >= 0
          ? internalData.uncompressedSize
          : 0;

      totalUncompressedBytes += uncompressedSize;

      const ext = getFileExtension(name);
      const { category, isText } = classifyExtension(ext, name);
      const isImportant = IMPORTANT_FILENAMES.has(name.toLowerCase());
      const suspicious = checkSuspiciousEntry(path, ext);

      if (!extensionBreakdown[ext]) {
        extensionBreakdown[ext] = { count: 0, bytes: 0 };
      }
      extensionBreakdown[ext].count += 1;
      extensionBreakdown[ext].bytes += uncompressedSize;

      categoryBreakdown[category].count += 1;
      categoryBreakdown[category].bytes += uncompressedSize;

      entries.push({
        path,
        name,
        isDir: false,
        extension: ext,
        category,
        uncompressedSize,
        date: zipObj.date,
        comment: zipObj.comment || '',
        isImportant,
        isSuspicious: suspicious.isSuspicious,
        suspiciousReason: suspicious.reason,
        isText,
      });
    }
  } else {
    // Scan PK\x03\x04 local headers directly for corrupted/truncated ZIPs
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let pos = 0;

    while (pos + 30 < bytes.length) {
      if (
        bytes[pos] === 0x50 &&
        bytes[pos + 1] === 0x4b &&
        bytes[pos + 2] === 0x03 &&
        bytes[pos + 3] === 0x04
      ) {
        const uncompSize = view.getUint32(pos + 22, true);
        const fnameLen = view.getUint16(pos + 26, true);
        const extraLen = view.getUint16(pos + 28, true);
        if (pos + 30 + fnameLen > bytes.length) break;

        const path = decoder.decode(bytes.subarray(pos + 30, pos + 30 + fnameLen));
        const isDir = path.endsWith('/');
        const parts = path.split('/').filter(Boolean);
        const name = parts[parts.length - 1] || path;

        if (path.includes('node_modules/')) hasNodeModules = true;
        if (path.includes('.git/')) hasGitFolder = true;
        if (path.includes('__MACOSX/') || name === '.DS_Store') hasMacOsCruft = true;
        if (path.includes('/build/')) hasBuildFolder = true;

        if (isDir) {
          folderCount++;
          entries.push({
            path,
            name,
            isDir: true,
            extension: 'folder',
            category: 'config',
            uncompressedSize: 0,
            date: new Date(),
            comment: 'Recovered from truncated ZIP',
            isImportant: false,
            isSuspicious: false,
            isText: false,
          });
        } else {
          fileCount++;
          pathsLower.add(path.toLowerCase());
          totalUncompressedBytes += uncompSize;
          const ext = getFileExtension(name);
          const { category, isText } = classifyExtension(ext, name);
          const isImportant = IMPORTANT_FILENAMES.has(name.toLowerCase());
          const suspicious = checkSuspiciousEntry(path, ext);

          if (!extensionBreakdown[ext]) {
            extensionBreakdown[ext] = { count: 0, bytes: 0 };
          }
          extensionBreakdown[ext].count += 1;
          extensionBreakdown[ext].bytes += uncompSize;

          categoryBreakdown[category].count += 1;
          categoryBreakdown[category].bytes += uncompSize;

          entries.push({
            path,
            name,
            isDir: false,
            extension: ext,
            category,
            uncompressedSize: uncompSize,
            date: new Date(),
            comment: 'Recovered from truncated ZIP',
            isImportant,
            isSuspicious: suspicious.isSuspicious,
            suspiciousReason: suspicious.reason,
            isText,
          });
        }
        pos = pos + 30 + fnameLen + extraLen;
      } else {
        pos++;
      }
    }

    if (entries.length === 0) {
      throw new Error('Corrupted archive: No ZIP headers found.');
    }
  }

  // Sort entries: important files & root files easily accessible, alphabetical by path
  entries.sort((a, b) => a.path.localeCompare(b.path));

  // Extract text previews for key manifest/important files (up to 15 files, < 150KB each)
  const importantFiles = entries.filter(
    (e) => !e.isDir && (e.isImportant || e.isSuspicious) && !e.path.includes('node_modules/')
  );

  if (zip && !isTruncatedRecovery) {
    for (const imp of importantFiles.slice(0, 15)) {
      if (imp.isText && imp.uncompressedSize < 150 * 1024) {
        const zf = zip.file(imp.path);
        if (zf) {
          try {
            const text = await zf.async('string');
            imp.textPreview = text;
          } catch {
            // ignore read error
          }
        }
      }
    }
  }

  // Detect project stacks / frameworks
  const detectedProjectTypes: string[] = [];
  const hasFileEnding = (suffix: string) =>
    Array.from(pathsLower).some((p) => p === suffix || p.endsWith(`/${suffix}`));

  if (hasFileEnding('package.json')) {
    if (hasFileEnding('vite.config.ts') || hasFileEnding('vite.config.js')) {
      detectedProjectTypes.push('Vite Web Application');
    }
    if (hasFileEnding('next.config.js') || hasFileEnding('next.config.mjs') || hasFileEnding('next.config.ts')) {
      detectedProjectTypes.push('Next.js Application');
    }
    if (hasFileEnding('tsconfig.json')) {
      detectedProjectTypes.push('TypeScript / Node.js');
    } else {
      detectedProjectTypes.push('JavaScript / Node.js');
    }
  }
  if (hasFileEnding('androidmanifest.xml') || hasFileEnding('build.gradle') || hasFileEnding('build.gradle.kts')) {
    detectedProjectTypes.push('Android / Gradle Project');
  }
  if (hasFileEnding('pubspec.yaml')) {
    detectedProjectTypes.push('Flutter / Dart Project');
  }
  if (hasFileEnding('requirements.txt') || hasFileEnding('pyproject.toml') || hasFileEnding('main.py')) {
    detectedProjectTypes.push('Python Project');
  }
  if (hasFileEnding('cargo.toml')) {
    detectedProjectTypes.push('Rust / Cargo Project');
  }
  if (hasFileEnding('go.mod')) {
    detectedProjectTypes.push('Go Module');
  }
  if (hasFileEnding('index.html') && detectedProjectTypes.length === 0) {
    detectedProjectTypes.push('Static HTML/CSS/JS Bundle');
  }
  if (detectedProjectTypes.length === 0) {
    if (categoryBreakdown.image.count > 0 && categoryBreakdown.code.count === 0) {
      detectedProjectTypes.push('Media & Image Asset Archive');
    } else if (categoryBreakdown.doc.count > 0 && categoryBreakdown.code.count === 0) {
      detectedProjectTypes.push('Document & Data Archive');
    } else {
      detectedProjectTypes.push('General File Archive');
    }
  }

  // Build diagnostic findings
  const diagnostics: ZipDiagnosticFinding[] = [];

  if (isTruncatedRecovery) {
    diagnostics.push({
      level: 'alert',
      title: 'Corrupted / Truncated ZIP Archive (Missing Central Directory)',
      detail: `Central directory & EOCD records are missing (likely cut off mid-upload). Recovered ${fileCount} local file headers via binary scan.`,
    });
  } else {
    diagnostics.push({
      level: 'healthy',
      title: 'Archive Integrity Verified',
      detail: `Successfully parsed ZIP central directory (${fileCount} files across ${folderCount} folders, ${formatBytes(
        totalUncompressedBytes
      )} uncompressed).`,
    });
  }

  const suspiciousList = entries.filter((e) => e.isSuspicious);
  if (suspiciousList.length > 0) {
    for (const s of suspiciousList.slice(0, 5)) {
      diagnostics.push({
        level: 'alert',
        title: `Sensitive / Binary Entry: ${s.path}`,
        detail: s.suspiciousReason || 'Requires manual security review before use.',
      });
    }
  } else {
    diagnostics.push({
      level: 'healthy',
      title: 'No Exposed Secrets or Executables Found',
      detail: 'Scanned all paths for .env files, private keys (.pem/.key/.jks), and raw executables (.exe/.dll).',
    });
  }

  if (hasNodeModules) {
    diagnostics.push({
      level: 'warning',
      title: 'Bundled node_modules Directory Detected',
      detail: 'Archive includes node_modules/, which inflates archive size and may contain platform-specific binaries.',
    });
  }

  if (hasGitFolder) {
    diagnostics.push({
      level: 'info',
      title: 'Embedded .git Repository History',
      detail: 'Archive contains a .git/ directory with commit history.',
    });
  }

  if (hasMacOsCruft) {
    diagnostics.push({
      level: 'info',
      title: 'macOS Metadata Files (__MACOSX / .DS_Store)',
      detail: 'Contains macOS resource fork files that can be safely ignored.',
    });
  }

  if (hasBuildFolder) {
    diagnostics.push({
      level: 'info',
      title: 'Compiled Build Output Included (dist/ or build/)',
      detail: 'Archive contains pre-built distribution artifacts alongside source files.',
    });
  }

  // Inspect package.json dependencies if available
  const pkgEntry = importantFiles.find((e) => e.name.toLowerCase() === 'package.json' && e.textPreview);
  if (pkgEntry && pkgEntry.textPreview) {
    try {
      const pkg = JSON.parse(pkgEntry.textPreview);
      const depCount = Object.keys(pkg.dependencies || {}).length;
      const devDepCount = Object.keys(pkg.devDependencies || {}).length;
      const scripts = Object.keys(pkg.scripts || {}).join(', ');
      diagnostics.push({
        level: 'info',
        title: `package.json Manifest (${pkg.name || 'unnamed'})`,
        detail: `${depCount} runtime dependencies, ${devDepCount} devDependencies. Scripts: ${scripts || 'none'}.`,
      });
    } catch {
      diagnostics.push({
        level: 'warning',
        title: 'Malformed package.json',
        detail: 'package.json could not be parsed as valid JSON.',
      });
    }
  }

  return {
    driveFile,
    status: 'completed',
    compressedBytes,
    totalUncompressedBytes,
    fileCount,
    folderCount,
    entries,
    extensionBreakdown,
    categoryBreakdown,
    detectedProjectTypes,
    importantFiles,
    diagnostics,
    zipInstance: zip,
  };
}

export async function readZipEntryContent(
  report: ZipInspectionReport,
  entry: ZipEntryInfo
): Promise<{ type: 'text' | 'image' | 'binary'; content: string }> {
  if (!report.zipInstance) {
    throw new Error('ZIP instance is not loaded in memory');
  }
  const zf = report.zipInstance.file(entry.path);
  if (!zf) {
    throw new Error(`Entry not found in archive: ${entry.path}`);
  }

  if (entry.category === 'image' && entry.extension !== 'svg') {
    const base64 = await zf.async('base64');
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      ico: 'image/x-icon',
      bmp: 'image/bmp',
    };
    const mime = mimeMap[entry.extension] || 'image/png';
    return {
      type: 'image',
      content: `data:${mime};base64,${base64}`,
    };
  }

  if (entry.isText || entry.uncompressedSize < 512 * 1024) {
    try {
      const text = await zf.async('string');
      // Check if mostly printable UTF-8 or binary
      const nonPrintable = text.slice(0, 1000).split('').filter((ch) => {
        const code = ch.charCodeAt(0);
        return code === 0;
      }).length;

      if (nonPrintable > 0) {
        const uint8 = await zf.async('uint8array');
        return {
          type: 'binary',
          content: formatHexPreview(uint8.slice(0, 512)),
        };
      }
      return {
        type: 'text',
        content: text,
      };
    } catch {
      const uint8 = await zf.async('uint8array');
      return {
        type: 'binary',
        content: formatHexPreview(uint8.slice(0, 512)),
      };
    }
  }

  const uint8 = await zf.async('uint8array');
  return {
    type: 'binary',
    content: formatHexPreview(uint8.slice(0, 512)),
  };
}

function formatHexPreview(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
    lines.push(`${i.toString(16).padStart(6, '0')}  ${hex.padEnd(48, ' ')}  |${ascii}|`);
  }
  return lines.join('\n');
}

export interface ScaffoldFileEntry {
  path: string;
  description: string;
  content: string;
}

export function getGitRailwayScaffoldFiles(): ScaffoldFileEntry[] {
  return [
    {
      path: '.gitignore',
      description: 'Excludes .git bloat, build outputs, APKs, keystores, vendor/, node_modules/, and secrets',
      content: `# Environment & Secrets
.env
.env.local
.env.*.local
*.jks
*.keystore
google-services.json

# PHP / Backend
backend/vendor/
backend/phpmyadmin/
backend/uploads/*
!backend/uploads/.gitkeep

# Node.js Socket Server
socket-server/node_modules/
socket-server/npm-debug.log*

# Android Studio / Gradle
android/.gradle/
android/local.properties
android/app/build/
android/ludogame/build/
android/upiPay/build/
android/.idea/
android/*.iml
android/app/*.iml
*.apk
*.ap_
*.aab
*.dex

# OS & Junk
.DS_Store
__MACOSX/
Thumbs.db
`,
    },
    {
      path: 'README.md',
      description: 'Step-by-step Git repo setup, Railway PHP + MySQL deployment, and Android URL configuration',
      content: `# Teen Patti Champion — Clean Git & Railway Monorepo

This repository structure organizes the Teen Patti Champion platform cleanly for **Git** and **Railway** deployment, stripping ~900 MB of build caches, nested \`.git\` history, \`phpmyadmin/\`, and unrelated files.

## Folder Structure

\`\`\`text
.
├── .gitignore
├── README.md
├── backend/                  # PHP CodeIgniter backend (Deploy on Railway)
│   ├── Dockerfile            # PHP 8.1 Apache + mysqli/pdo_mysql/gd + dynamic $PORT
│   ├── railway.json          # Railway service config & healthcheck
│   ├── composer.json         # Clean CodeIgniter + Razorpay + Paytm dependencies
│   ├── .env.example          # Mapped to Railway MySQL plugin variables
│   ├── .htaccess             # Clean URL routing for CodeIgniter
│   └── .well-known/
│       └── assetlinks.json   # Android App Links config
├── socket-server/            # Node.js Socket.IO + Aviator server (Deploy on Railway)
│   ├── railway.json
│   └── .env.example
└── android/                  # Clean Android Studio source (letscardplay/)
    └── CONST_UPDATE_GUIDE.md # Steps to point Const.java to Railway HTTPS URLs
\`\`\`

## 1. Before Pushing to Git

1. Move your clean \`letscardplay/\` Android source into \`android/\` (delete \`app/build/\`, \`.gradle/\`, \`.git/\`, \`local.properties\`, and \`playtsore/*.jks\`).
2. Re-obtain the **complete PHP backend** (\`application/\`, \`system/\`, \`index.php\`, \`assets/\`, and \`.sql\` database dump) and place them inside \`backend/\`. *(Note: \`teenpatti_champion.zip\` in Drive was truncated at 33.6 MB before \`application/\` was included).*
3. Commit and push to GitHub/GitLab:
   \`\`\`bash
   git init
   git add .
   git commit -m "Initial clean monorepo for Railway and Android"
   git push -u origin main
   \`\`\`

## 2. Deploy Backend to Railway

1. Create a **New Project** in Railway and attach a **MySQL** database service.
2. Import the backend \`.sql\` dump into the Railway MySQL database.
3. Add a **Service from GitHub Repo**, set **Root Directory** to \`/backend\`.
4. Add environment variables in Railway pointing to your MySQL service:
   - \`DB_HOST=\${{MySQL.MYSQLHOST}}\`
   - \`DB_PORT=\${{MySQL.MYSQLPORT}}\`
   - \`DB_USERNAME=\${{MySQL.MYSQLUSER}}\`
   - \`DB_PASSWORD=\${{MySQL.MYSQLPASSWORD}}\`
   - \`DB_NAME=\${{MySQL.MYSQLDATABASE}}\`
   - \`APP_URL=https://your-backend.up.railway.app/\`

## 3. Update Android App URLs

Update \`android/app/src/main/java/com/teenpattigards/teenpattichampion/ApiClasses/Const.java\`:
- Replace \`http://139.59.68.120/letscard/\` with \`https://your-backend.up.railway.app/\`
- Replace \`http://64.227.186.5:3002/api\` with \`https://your-socket.up.railway.app/api\`
`,
    },
    {
      path: 'backend/Dockerfile',
      description: 'Railway-ready PHP Apache container with mysqli, pdo_mysql, gd, mod_rewrite, and dynamic $PORT',
      content: `FROM php:8.1-apache

# Install system dependencies & PHP extensions required by CodeIgniter
RUN apt-get update && apt-get install -y \\
    libpng-dev \\
    libjpeg-dev \\
    libfreetype6-dev \\
    libzip-dev \\
    unzip \\
    git \\
    && docker-php-ext-configure gd --with-freetype --with-jpeg \\
    && docker-php-ext-install mysqli pdo pdo_mysql gd zip \\
    && a2enmod rewrite headers \\
    && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Install PHP dependencies first for layer caching
COPY composer.json composer.lock* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction || true

# Copy application source
COPY . .

# Ensure writable uploads/cache folders
RUN mkdir -p application/cache application/logs uploads \\
    && chown -R www-data:www-data /var/www/html

# Allow .htaccess overrides in Apache
RUN sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf

# Bind Apache dynamically to Railway's PORT environment variable
CMD ["sh", "-c", "sed -i 's/80/'\${PORT:-8080}'/g' /etc/apache2/sites-available/000-default.conf /etc/apache2/ports.conf && apache2-foreground"]
`,
    },
    {
      path: 'backend/railway.json',
      description: 'Railway deployment manifest for the PHP backend service',
      content: `{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
`,
    },
    {
      path: 'backend/.htaccess',
      description: 'Apache mod_rewrite rules for CodeIgniter clean URLs',
      content: `<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ index.php/$1 [L]
</IfModule>
`,
    },
    {
      path: 'backend/.env.example',
      description: 'Safe template for Railway MySQL environment variables (no hardcoded passwords)',
      content: `DB_HOST=mysql.railway.internal
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=REPLACE_WITH_RAILWAY_MYSQL_PASSWORD
DB_NAME=railway
APP_URL=https://your-backend.up.railway.app/
`,
    },
    {
      path: 'backend/composer.json',
      description: 'Recovered Composer manifest for CodeIgniter + Razorpay + Paytm',
      content: `{
  "description": "The CodeIgniter framework",
  "name": "codeigniter/framework",
  "type": "project",
  "homepage": "https://codeigniter.com",
  "license": "MIT",
  "require": {
    "php": ">=7.4",
    "vlucas/phpdotenv": "^4.1",
    "razorpay/razorpay": "2.*",
    "paytm/paytmchecksum": "*"
  }
}
`,
    },
    {
      path: 'backend/.well-known/assetlinks.json',
      description: 'Recovered Android Digital Asset Links manifest (update package_name to match build.gradle)',
      content: `[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.teenpattigards.teenpattichampion",
      "sha256_cert_fingerprints": [
        "REPLACE_WITH_YOUR_RELEASE_KEYSTORE_SHA256"
      ]
    }
  }
]
`,
    },
    {
      path: 'socket-server/railway.json',
      description: 'Railway Nixpacks config for the companion Node.js Socket.IO / Aviator API service',
      content: `{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
`,
    },
    {
      path: 'socket-server/.env.example',
      description: 'Environment template for Node.js Socket.IO & Aviator service',
      content: `PORT=3002
MYSQL_HOST=mysql.railway.internal
MYSQL_USER=root
MYSQL_PASSWORD=REPLACE_WITH_RAILWAY_MYSQL_PASSWORD
MYSQL_DATABASE=railway
AVIATOR_TOKEN=REPLACE_WITH_NEW_SECRET_TOKEN
`,
    },
    {
      path: 'android/CONST_UPDATE_GUIDE.md',
      description: 'Checklist to clean and connect the Android app from teenpatti champion3.zip to Railway',
      content: `# Android Studio Cleanup & Railway Connection Checklist

1. Extract \`teenpatti champion/letscardplay/\` from \`teenpatti champion3.zip\` into \`android/\`.
2. Delete these bloat/sensitive folders before committing to Git:
   - \`android/.git/\` (462 MB)
   - \`android/app/build/\` (430 MB, includes 162 MB debug APK)
   - \`android/.gradle/\`
   - \`android/local.properties\`
   - \`android/playtsore/letsplaycard.jks\` (keep safely outside Git!)
3. In \`android/build.gradle\`, add \`mavenCentral()\` alongside \`jcenter()\` so dependencies resolve cleanly.
4. In \`android/app/src/main/java/com/teenpattigards/teenpattichampion/ApiClasses/Const.java\`:
   - Change \`MAIN\` from \`http://139.59.68.120/letscard/\` to your Railway HTTPS URL.
   - Change \`AVIATOR_MAIN\` from \`http://64.227.186.5:3002/api\` to your Railway Socket service HTTPS URL.
   - Rotate \`AVIATOR_Token\` to match your Railway \`AVIATOR_TOKEN\` env var.
`,
    },
  ];
}

export async function downloadGitRailwayScaffoldZip(): Promise<void> {
  const zip = new JSZip();
  const files = getGitRailwayScaffoldFiles();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  zip.file('backend/uploads/.gitkeep', '');
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'teenpatti-git-railway-scaffold.zip';
  a.click();
  URL.revokeObjectURL(url);
}

