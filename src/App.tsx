import React, { useEffect, useState, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, logout, getAccessToken } from './auth';
import {
  DriveFileMeta,
  ZipEntryInfo,
  ZipInspectionReport,
  parseDriveFolderId,
  formatBytes,
  isZipFile,
  fetchFolderMetadata,
  listFolderContents,
  inspectZipFromDrive,
  inspectZipArrayBuffer,
  readZipEntryContent,
  getGitRailwayScaffoldFiles,
  downloadGitRailwayScaffoldZip,
} from './services/driveZipInspector';
import {
  FolderArchive,
  Search,
  RefreshCw,
  FileText,
  FileCode,
  FileImage,
  FileBox,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  Info,
  Download,
  Upload,
  ExternalLink,
  ChevronRight,
  LogOut,
  Eye,
  X,
  GitBranch,
  Copy,
  Check,
} from 'lucide-react';

const DEFAULT_FOLDER_URL = 'https://drive.google.com/drive/folders/1sStZDzLhIsRS6Hag_FxSOqqE0lAKYUhm';

type WorkspaceSection = 'overview' | 'archives' | 'tree' | 'viewer' | 'railway';
type EntryCategoryFilter = 'all' | 'important' | 'code' | 'config' | 'doc' | 'image' | 'suspicious';

export default function App() {
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [folderInput, setFolderInput] = useState<string>(DEFAULT_FOLDER_URL);
  const [activeFolderId, setActiveFolderId] = useState<string>(
    parseDriveFolderId(DEFAULT_FOLDER_URL)
  );
  const [folderMeta, setFolderMeta] = useState<DriveFileMeta | null>(null);
  const [folderFiles, setFolderFiles] = useState<DriveFileMeta[]>([]);
  const [isScanningFolder, setIsScanningFolder] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [reports, setReports] = useState<Record<string, ZipInspectionReport>>({});
  const [selectedZipId, setSelectedZipId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');

  // File Tree Filters
  const [entrySearch, setEntrySearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<EntryCategoryFilter>('all');

  // Active File Content Inspector
  const [selectedEntry, setSelectedEntry] = useState<ZipEntryInfo | null>(null);
  const [entryContent, setEntryContent] = useState<{
    type: 'text' | 'image' | 'binary';
    content: string;
  } | null>(null);
  const [isReadingEntry, setIsReadingEntry] = useState<boolean>(false);
  const [entryReadError, setEntryReadError] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [selectedScaffoldPath, setSelectedScaffoldPath] = useState<string>('.gitignore');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scaffoldFiles = useMemo(() => getGitRailwayScaffoldFiles(), []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Automatically scan the requested Google Drive folder once signed in
  useEffect(() => {
    if (!needsAuth && activeFolderId) {
      handleScanDriveFolder(activeFolderId);
    }
  }, [needsAuth]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setFolderFiles([]);
    setReports({});
    setSelectedZipId(null);
  };

  const handleScanDriveFolder = async (targetIdOverride?: string) => {
    const parsedId = targetIdOverride || parseDriveFolderId(folderInput);
    if (!parsedId) {
      setScanError('Please enter a valid Google Drive Folder URL or Folder ID.');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setActiveFolderId(parsedId);
    setIsScanningFolder(true);
    setScanError(null);

    try {
      const [meta, files] = await Promise.all([
        fetchFolderMetadata(parsedId, token),
        listFolderContents(parsedId, token),
      ]);

      setFolderMeta(meta);
      setFolderFiles(files);

      const zipFiles = files.filter(isZipFile);
      if (zipFiles.length > 0) {
        // Initialize pending reports
        const initialReports: Record<string, ZipInspectionReport> = {};
        for (const zf of zipFiles) {
          initialReports[zf.id] = {
            driveFile: zf,
            status: 'downloading',
            compressedBytes: Number(zf.size || 0),
            totalUncompressedBytes: 0,
            fileCount: 0,
            folderCount: 0,
            entries: [],
            extensionBreakdown: {},
            categoryBreakdown: {},
            detectedProjectTypes: [],
            importantFiles: [],
            diagnostics: [],
          };
        }
        setReports((prev) => ({ ...prev, ...initialReports }));
        setSelectedZipId((prev) => prev || zipFiles[0].id);

        // Deep-inspect every ZIP file in the folder sequentially/concurrently
        for (const zf of zipFiles) {
          try {
            const report = await inspectZipFromDrive(zf, token);
            setReports((prev) => ({
              ...prev,
              [zf.id]: report,
            }));
          } catch (zipErr: unknown) {
            const errMsg =
              zipErr instanceof Error ? zipErr.message : 'Failed to inspect ZIP archive';
            setReports((prev) => ({
              ...prev,
              [zf.id]: {
                ...prev[zf.id],
                status: 'error',
                errorMessage: errMsg,
              },
            }));
          }
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to list files in this Google Drive folder.';
      setScanError(msg);
    } finally {
      setIsScanningFolder(false);
    }
  };

  const handleLocalZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const localId = `local-${file.name}-${file.lastModified}`;
      const pseudoMeta: DriveFileMeta = {
        id: localId,
        name: file.name,
        mimeType: file.type || 'application/zip',
        size: String(file.size),
        modifiedTime: new Date(file.lastModified).toISOString(),
      };

      setFolderFiles((prev) => {
        if (prev.some((f) => f.id === localId)) return prev;
        return [pseudoMeta, ...prev];
      });

      setReports((prev) => ({
        ...prev,
        [localId]: {
          driveFile: pseudoMeta,
          status: 'inspecting',
          compressedBytes: file.size,
          totalUncompressedBytes: 0,
          fileCount: 0,
          folderCount: 0,
          entries: [],
          extensionBreakdown: {},
          categoryBreakdown: {},
          detectedProjectTypes: [],
          importantFiles: [],
          diagnostics: [],
        },
      }));

      setSelectedZipId(localId);

      try {
        const buffer = await file.arrayBuffer();
        const report = await inspectZipArrayBuffer(pseudoMeta, buffer);
        setReports((prev) => ({
          ...prev,
          [localId]: report,
        }));
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Corrupted or invalid ZIP archive';
        setReports((prev) => ({
          ...prev,
          [localId]: {
            ...prev[localId],
            status: 'error',
            errorMessage: errMsg,
          },
        }));
      }
    }
    e.target.value = '';
  };

  const handleInspectEntry = async (report: ZipInspectionReport, entry: ZipEntryInfo) => {
    if (entry.isDir) return;
    setSelectedEntry(entry);
    setActiveSection('viewer');
    setIsReadingEntry(true);
    setEntryReadError(null);

    try {
      const result = await readZipEntryContent(report, entry);
      setEntryContent(result);
    } catch (err: unknown) {
      setEntryReadError(
        err instanceof Error ? err.message : 'Unable to read entry content from archive.'
      );
      setEntryContent(null);
    } finally {
      setIsReadingEntry(false);
    }
  };

  const handleExportReportJson = () => {
    const exportPayload = Object.values(reports).map((r) => ({
      fileName: r.driveFile.name,
      driveFileId: r.driveFile.id,
      status: r.status,
      compressedBytes: r.compressedBytes,
      totalUncompressedBytes: r.totalUncompressedBytes,
      fileCount: r.fileCount,
      folderCount: r.folderCount,
      detectedProjectTypes: r.detectedProjectTypes,
      diagnostics: r.diagnostics,
      extensionBreakdown: r.extensionBreakdown,
      files: r.entries.map((e) => ({
        path: e.path,
        isDir: e.isDir,
        uncompressedSize: e.uncompressedSize,
        category: e.category,
        isImportant: e.isImportant,
        isSuspicious: e.isSuspicious,
        suspiciousReason: e.suspiciousReason,
      })),
    }));

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drive-zip-audit-${activeFolderId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const zipFilesInFolder = useMemo(() => folderFiles.filter(isZipFile), [folderFiles]);
  const nonZipFilesInFolder = useMemo(
    () => folderFiles.filter((f) => !isZipFile(f)),
    [folderFiles]
  );

  const activeReport = selectedZipId ? reports[selectedZipId] || null : null;

  const filteredEntries = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.entries.filter((entry) => {
      if (entry.isDir) return false;
      if (categoryFilter === 'important' && !entry.isImportant) return false;
      if (categoryFilter === 'suspicious' && !entry.isSuspicious) return false;
      if (
        ['code', 'config', 'doc', 'image'].includes(categoryFilter) &&
        entry.category !== categoryFilter
      ) {
        return false;
      }
      if (entrySearch.trim()) {
        const q = entrySearch.toLowerCase();
        return entry.path.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeReport, categoryFilter, entrySearch]);

  const aggregateStats = useMemo(() => {
    const list = Object.values(reports);
    let totalZips = list.length;
    let completedZips = 0;
    let totalExtractedFiles = 0;
    let totalUncompressed = 0;
    let alertCount = 0;

    for (const r of list) {
      if (r.status === 'completed') {
        completedZips++;
        totalExtractedFiles += r.fileCount;
        totalUncompressed += r.totalUncompressedBytes;
        alertCount += r.diagnostics.filter(
          (d) => d.level === 'alert' || d.level === 'warning'
        ).length;
      }
    }
    return {
      totalZips,
      completedZips,
      totalExtractedFiles,
      totalUncompressed,
      alertCount,
    };
  }, [reports]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#0F172A]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('overview');
          }}
          className="text-lg font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          Drive Archive Inspector
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveSection('overview')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'overview'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            Folder Audit
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('archives')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'archives'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            ZIP Diagnostics
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('tree')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'tree'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            File Explorer
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('viewer')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'viewer'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            Code & Manifests
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('railway')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'railway'
                ? 'text-white underline underline-offset-8 decoration-sky-400'
                : ''
            }`}
          >
            Git & Railway Setup
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportReportJson}
            disabled={Object.keys(reports).length === 0}
            className="px-4 py-2 text-xs font-medium text-slate-950 bg-sky-400 rounded-lg hover:bg-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Audit JSON
          </button>
        </div>
      </header>

      {/* Main Workspace Layout: Sidebar + Main Viewport */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Sidebar Navigation (270px width on desktop) */}
        <aside className="w-full lg:w-[280px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0F172A] p-5 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Target Folder Section */}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">
                Target Google Drive Folder
              </div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="Paste Drive folder link or ID..."
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleScanDriveFolder()}
                    disabled={isScanningFolder || needsAuth}
                    className="flex-1 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isScanningFolder ? 'animate-spin' : ''}`}
                    />
                    {isScanningFolder ? 'Inspecting...' : 'Scan Drive Folder'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    title="Inspect local ZIP file"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Local ZIP
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.jar,.apk,.aab"
                    multiple
                    onChange={handleLocalZipUpload}
                    className="hidden"
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 font-mono truncate">
                ID: {activeFolderId}
              </div>
            </div>

            {/* Discovered ZIP Archives List */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-400 mb-2.5">
                <span>Discovered ZIP Archives</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {zipFilesInFolder.length}
                </span>
              </div>

              {zipFilesInFolder.length === 0 ? (
                <div className="py-6 px-3 text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg text-center">
                  {needsAuth
                    ? 'Sign in with Google to load ZIP archives from the Drive folder.'
                    : isScanningFolder
                    ? 'Downloading & unpacking ZIP files...'
                    : 'No ZIP archives detected yet. Click Scan Drive Folder or upload a local ZIP.'}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                  {zipFilesInFolder.map((zf) => {
                    const rep = reports[zf.id];
                    const isSelected = selectedZipId === zf.id;
                    const statusLabel =
                      rep?.status === 'completed'
                        ? `${rep.fileCount} files · ${formatBytes(rep.totalUncompressedBytes)}`
                        : rep?.status === 'error'
                        ? 'Error reading ZIP'
                        : 'Unpacking archive...';

                    return (
                      <button
                        key={zf.id}
                        type="button"
                        onClick={() => {
                          setSelectedZipId(zf.id);
                          if (activeSection === 'overview') {
                            setActiveSection('archives');
                          }
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/90 border-sky-500/50 text-white'
                            : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{zf.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums truncate">
                          {statusLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Account & Auth State Footer */}
          <div className="pt-4 border-t border-slate-800">
            {user && !needsAuth ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {user.displayName || user.email}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    Google Drive Read-Only Connected
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Not connected to Google Drive
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-6 lg:p-8 overflow-y-auto space-y-8">
          {/* Authentication Prompt Banner when needsAuth is true */}
          {needsAuth && (
            <section className="p-6 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <h1 className="text-xl font-bold text-white font-display">
                  Connect Google Drive to Inspect Folder 1sStZDzLhIsRS6Hag_FxSOqqE0lAKYUhm
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Authorize read-only Google Drive access to automatically fetch every ZIP archive inside{' '}
                  <span className="font-mono text-sky-400">
                    drive.google.com/drive/folders/{activeFolderId}
                  </span>
                  , unpack its internal file tree in memory, verify archive integrity, and inspect source code and manifest files.
                </p>
                {authError && (
                  <p className="text-xs text-red-400 font-medium">{authError}</p>
                )}
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        ></path>
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        ></path>
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        ></path>
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        ></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>
            </section>
          )}

          {/* Error Notice if Drive folder fails to load */}
          {scanError && (
            <div className="p-4 rounded-xl border border-red-900/60 bg-red-950/30 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-red-200">
                    Unable to Read Google Drive Folder ({activeFolderId})
                  </div>
                  <p className="text-xs text-red-300/90 leading-relaxed">
                    {scanError}. Ensure your signed-in Google account ({user?.email || 'current user'}) has permission to view this folder, or upload the ZIP archives directly using the Local ZIP button in the sidebar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleScanDriveFolder()}
                className="px-3 py-1.5 text-xs font-medium bg-red-900/50 hover:bg-red-800/60 text-red-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Retry Scan
              </button>
            </div>
          )}

          {/* Aggregate Summary Bar */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="text-xs text-slate-400">Target Folder</div>
              <div className="mt-1 text-base font-semibold text-white truncate">
                {folderMeta?.name || `Folder ${activeFolderId.slice(0, 12)}...`}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {folderFiles.length} total items in Drive
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="text-xs text-slate-400">ZIP Archives Inspected</div>
              <div className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
                {aggregateStats.completedZips} / {aggregateStats.totalZips}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Deep central-directory unpack
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="text-xs text-slate-400">Total Extracted Files</div>
              <div className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
                {aggregateStats.totalExtractedFiles.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {formatBytes(aggregateStats.totalUncompressed)} uncompressed
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="text-xs text-slate-400">Warnings & Security Notices</div>
              <div
                className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                  aggregateStats.alertCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {aggregateStats.alertCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Secrets, binaries & bloat check
              </div>
            </div>
          </section>

          {/* View Mode Switcher Tabs (Functional segmented control) */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setActiveSection('overview')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'overview'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                01. All ZIPs Overview ({zipFilesInFolder.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('archives')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'archives'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                02. Selected Archive Audit
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('tree')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'tree'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                03. Internal File Explorer ({activeReport?.fileCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('viewer')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'viewer'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                04. Code & File Reader
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('railway')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === 'railway'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                05. Git & Railway Setup
              </button>
            </div>

            {activeReport && (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>Active Archive:</span>
                <span className="font-mono text-white font-medium">
                  {activeReport.driveFile.name}
                </span>
                {activeReport.driveFile.webViewLink && (
                  <a
                    href={activeReport.driveFile.webViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline inline-flex items-center gap-1 ml-1"
                  >
                    Drive Link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* SECTION 1: ALL ZIPS OVERVIEW */}
          {activeSection === 'overview' && (
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white font-display">
                  01. Complete ZIP Archive Inventory
                </h2>
                <p className="text-xs text-slate-400">
                  Every ZIP archive found in the Google Drive folder is downloaded into browser memory and inspected for directory structure, project stack, manifest files, and potential errors.
                </p>

                {zipFilesInFolder.length === 0 ? (
                  <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/30 text-center space-y-3">
                    <FolderArchive className="w-8 h-8 text-slate-500 mx-auto" />
                    <div className="text-sm font-medium text-slate-300">
                      {isScanningFolder
                        ? 'Scanning Google Drive folder for ZIP archives...'
                        : 'No ZIP archives loaded yet'}
                    </div>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Sign in with Google above to automatically inspect folder{' '}
                      <span className="font-mono text-slate-400">{activeFolderId}</span>, or upload any ZIP file from your device for instant deep analysis.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/70 text-[11px] font-medium text-slate-400">
                          <th className="py-3 px-4">Archive Filename</th>
                          <th className="py-3 px-4">Detected Stack / Contents</th>
                          <th className="py-3 px-4 text-right">Compressed</th>
                          <th className="py-3 px-4 text-right">Uncompressed</th>
                          <th className="py-3 px-4 text-right">Files / Folders</th>
                          <th className="py-3 px-4">Health & Diagnostics</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-xs">
                        {zipFilesInFolder.map((zf) => {
                          const rep = reports[zf.id];
                          const warnings =
                            rep?.diagnostics.filter(
                              (d) => d.level === 'alert' || d.level === 'warning'
                            ) || [];

                          return (
                            <tr
                              key={zf.id}
                              className="hover:bg-slate-900/50 transition-colors"
                            >
                              <td className="py-3 px-4 font-medium text-white font-mono">
                                {zf.name}
                              </td>
                              <td className="py-3 px-4 text-slate-300">
                                {rep?.status === 'completed'
                                  ? rep.detectedProjectTypes.join(' · ')
                                  : rep?.status === 'error'
                                  ? rep.errorMessage
                                  : 'Inspecting archive...'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                                {formatBytes(rep?.compressedBytes || Number(zf.size || 0))}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                                {rep?.status === 'completed'
                                  ? formatBytes(rep.totalUncompressedBytes)
                                  : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                                {rep?.status === 'completed'
                                  ? `${rep.fileCount} files / ${rep.folderCount} dirs`
                                  : '—'}
                              </td>
                              <td className="py-3 px-4">
                                {rep?.status === 'completed' ? (
                                  warnings.length > 0 ? (
                                    <span className="text-amber-400 inline-flex items-center gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                      {warnings.length} notice(s)
                                    </span>
                                  ) : (
                                    <span className="text-emerald-400 inline-flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      Verified Clean
                                    </span>
                                  )
                                ) : rep?.status === 'error' ? (
                                  <span className="text-red-400 inline-flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    Failed
                                  </span>
                                ) : (
                                  <span className="text-sky-400">Unpacking...</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedZipId(zf.id);
                                    setActiveSection('archives');
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-md transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  Deep Audit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Other Non-ZIP Files or Subfolders in the Drive Folder */}
              {nonZipFilesInFolder.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300 font-display">
                    02. Other Items & Subfolders in Drive Folder ({nonZipFilesInFolder.length})
                  </h3>
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/70 text-[11px] font-medium text-slate-400">
                          <th className="py-2.5 px-4">Name</th>
                          <th className="py-2.5 px-4">MIME Type</th>
                          <th className="py-2.5 px-4 text-right">Size</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-xs">
                        {nonZipFilesInFolder.map((item) => {
                          const isFolder =
                            item.mimeType === 'application/vnd.google-apps.folder';
                          return (
                            <tr key={item.id} className="hover:bg-slate-900/40">
                              <td className="py-2.5 px-4 text-slate-200 font-mono flex items-center gap-2">
                                {isFolder ? (
                                  <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                {item.name}
                              </td>
                              <td className="py-2.5 px-4 text-slate-400 font-mono">
                                {item.mimeType}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                                {item.size ? formatBytes(Number(item.size)) : '—'}
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {isFolder ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFolderInput(item.id);
                                      handleScanDriveFolder(item.id);
                                    }}
                                    className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 rounded transition-colors cursor-pointer"
                                  >
                                    Open Subfolder
                                  </button>
                                ) : item.webViewLink ? (
                                  <a
                                    href={item.webViewLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sky-400 hover:underline inline-flex items-center gap-1"
                                  >
                                    View <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: SELECTED ARCHIVE DEEP AUDIT */}
          {activeSection === 'archives' && (
            <div className="space-y-8">
              {!activeReport ? (
                <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-400">
                  Select a ZIP archive from the left sidebar or table to view its detailed audit.
                </div>
              ) : activeReport.status === 'error' ? (
                <div className="p-6 rounded-xl border border-red-900/60 bg-red-950/30 text-sm text-red-200">
                  Failed to inspect {activeReport.driveFile.name}: {activeReport.errorMessage}
                </div>
              ) : activeReport.status !== 'completed' ? (
                <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-sm text-sky-300">
                  Downloading and unpacking {activeReport.driveFile.name}...
                </div>
              ) : (
                <>
                  {/* Archive Header & Metadata */}
                  <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-white font-display">
                        {activeReport.driveFile.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>{activeReport.detectedProjectTypes.join(' · ')}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Compressed: {formatBytes(activeReport.compressedBytes)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Uncompressed: {formatBytes(activeReport.totalUncompressedBytes)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {activeReport.fileCount} files in {activeReport.folderCount} folders
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSection('tree')}
                      className="px-4 py-2 text-xs font-medium bg-sky-400 text-slate-950 rounded-lg hover:bg-sky-300 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Browse All {activeReport.fileCount} Files
                    </button>
                  </div>

                  {/* Diagnostic Findings & Integrity Checks */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white font-display">
                      01. Integrity, Structure & Security Diagnostics
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeReport.diagnostics.map((diag, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 flex items-start gap-3"
                        >
                          {diag.level === 'healthy' && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          )}
                          {diag.level === 'info' && (
                            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                          )}
                          {diag.level === 'warning' && (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          )}
                          {diag.level === 'alert' && (
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-100">
                              {diag.title}
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed break-words">
                              {diag.detail}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* File Extension & Category Breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-white font-display">
                        02. Extension Breakdown
                      </h3>
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/70 text-[11px] text-slate-400">
                              <th className="py-2.5 px-4">Extension</th>
                              <th className="py-2.5 px-4 text-right">File Count</th>
                              <th className="py-2.5 px-4 text-right">Uncompressed Size</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70">
                            {Object.entries(activeReport.extensionBreakdown)
                              .sort((a, b) => b[1].count - a[1].count)
                              .slice(0, 12)
                              .map(([ext, stats]) => (
                                <tr key={ext} className="hover:bg-slate-900/40">
                                  <td className="py-2 px-4 font-mono text-slate-200">
                                    .{ext}
                                  </td>
                                  <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-300">
                                    {stats.count}
                                  </td>
                                  <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-400">
                                    {formatBytes(stats.bytes)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Key Manifests & Entrypoint Files Quick-Inspect */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-white font-display">
                        03. Key Manifests, Configs & Entrypoints ({activeReport.importantFiles.length})
                      </h3>
                      {activeReport.importantFiles.length === 0 ? (
                        <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 text-xs text-slate-400">
                          No standard manifest files (like package.json, README.md, requirements.txt) found at top level. Use the File Explorer tab to inspect any file.
                        </div>
                      ) : (
                        <div className="border border-slate-800 rounded-xl divide-y divide-slate-800/70 max-h-[360px] overflow-y-auto">
                          {activeReport.importantFiles.map((entry) => (
                            <div
                              key={entry.path}
                              className="p-3.5 hover:bg-slate-900/50 transition-colors flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-mono font-medium text-white truncate">
                                  {entry.path}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                                  {formatBytes(entry.uncompressedSize)}
                                  {entry.isSuspicious && (
                                    <span className="text-amber-400 ml-2">
                                      · {entry.suspiciousReason}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleInspectEntry(activeReport, entry)}
                                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-md transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Read Content
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline Previews of Extracted Manifests (README / package.json / configs) */}
                  {activeReport.importantFiles.some((f) => f.textPreview) && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-white font-display">
                        04. Automatic Content Preview of Key Files Inside {activeReport.driveFile.name}
                      </h3>
                      <div className="grid grid-cols-1 gap-4">
                        {activeReport.importantFiles
                          .filter((f) => f.textPreview)
                          .slice(0, 6)
                          .map((file) => (
                            <div
                              key={file.path}
                              className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden"
                            >
                              <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-4">
                                <div className="text-xs font-mono font-semibold text-sky-400">
                                  {file.path}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                    {formatBytes(file.uncompressedSize)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleInspectEntry(activeReport, file)}
                                    className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
                                  >
                                    Open in Full Reader
                                  </button>
                                </div>
                              </div>
                              <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-64 leading-relaxed">
                                {file.textPreview?.slice(0, 4000)}
                              </pre>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* SECTION 3: INTERNAL FILE EXPLORER */}
          {activeSection === 'tree' && (
            <div className="space-y-5">
              {!activeReport || activeReport.status !== 'completed' ? (
                <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/30 text-center text-xs text-slate-400">
                  Select an inspected ZIP archive to browse its internal files.
                </div>
              ) : (
                <>
                  {/* Filter & Search Bar */}
                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={entrySearch}
                        onChange={(e) => setEntrySearch(e.target.value)}
                        placeholder={`Search ${activeReport.fileCount} files in ${activeReport.driveFile.name}...`}
                        className="w-full pl-9 pr-4 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                      {(
                        [
                          { id: 'all', label: 'All Files' },
                          { id: 'important', label: 'Manifests' },
                          { id: 'code', label: 'Source Code' },
                          { id: 'config', label: 'Configs' },
                          { id: 'doc', label: 'Docs' },
                          { id: 'image', label: 'Images' },
                          { id: 'suspicious', label: 'Notices' },
                        ] as { id: EntryCategoryFilter; label: string }[]
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setCategoryFilter(tab.id)}
                          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                            categoryFilter === tab.id
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* High-Density Data Grid */}
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-medium text-slate-400">
                          <th className="py-2.5 px-4">Internal File Path</th>
                          <th className="py-2.5 px-4">Category</th>
                          <th className="py-2.5 px-4 text-right">Uncompressed Size</th>
                          <th className="py-2.5 px-4 text-right">Modified Date</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 text-xs">
                        {filteredEntries.slice(0, 300).map((entry) => (
                          <tr
                            key={entry.path}
                            className="hover:bg-slate-900/50 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-mono text-slate-200 break-all">
                              <div className="flex items-center gap-2">
                                {entry.category === 'code' && (
                                  <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                )}
                                {entry.category === 'image' && (
                                  <FileImage className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                )}
                                {entry.category === 'archive' && (
                                  <FileBox className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                )}
                                {!['code', 'image', 'archive'].includes(entry.category) && (
                                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <span>{entry.path}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-slate-400">
                              {entry.category} · .{entry.extension}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                              {formatBytes(entry.uncompressedSize)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                              {entry.date ? entry.date.toISOString().slice(0, 10) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleInspectEntry(activeReport, entry)}
                                className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-sky-300 rounded transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Inspect File
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredEntries.length === 0 && (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No files match the current filter criteria.
                      </div>
                    )}
                    {filteredEntries.length > 300 && (
                      <div className="p-3 border-t border-slate-800 bg-slate-900/50 text-center text-xs text-slate-400">
                        Showing first 300 of {filteredEntries.length} matching files. Use the search input above to narrow down specific paths.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SECTION 4: CODE & FILE READER */}
          {activeSection === 'viewer' && (
            <div className="space-y-4">
              {!selectedEntry || !activeReport ? (
                <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/30 text-center space-y-2">
                  <div className="text-sm font-medium text-slate-300">
                    No File Selected for Reading
                  </div>
                  <p className="text-xs text-slate-500">
                    Click "Read Content" or "Inspect File" on any entry in the Archive Audit or File Explorer tabs to examine its full source code, image preview, or hex dump.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-mono font-bold text-white">
                        {selectedEntry.path}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        Archive: {activeReport.driveFile.name} · Size:{' '}
                        {formatBytes(selectedEntry.uncompressedSize)} · Category:{' '}
                        {selectedEntry.category}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveSection('tree')}
                      className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Back to File List
                    </button>
                  </div>

                  <div className="p-5">
                    {isReadingEntry ? (
                      <div className="py-12 text-center text-xs text-sky-400">
                        Extracting {selectedEntry.name} from ZIP archive...
                      </div>
                    ) : entryReadError ? (
                      <div className="p-4 rounded-lg bg-red-950/40 border border-red-900 text-xs text-red-300">
                        {entryReadError}
                      </div>
                    ) : entryContent?.type === 'image' ? (
                      <div className="flex flex-col items-center justify-center p-6 bg-slate-950/60 rounded-lg border border-slate-800">
                        <img
                          src={entryContent.content}
                          alt={selectedEntry.name}
                          referrerPolicy="no-referrer"
                          className="max-h-[480px] object-contain rounded"
                        />
                      </div>
                    ) : (
                      <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 text-xs font-mono text-slate-200 overflow-x-auto max-h-[640px] leading-relaxed">
                        {entryContent?.content}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 5: GIT REPO & RAILWAY SETUP */}
          {activeSection === 'railway' && (
            <div className="space-y-6">
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/50 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-3xl">
                  <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold">
                    <GitBranch className="w-4 h-4" />
                    <span>Clean Git Monorepo & Railway Deployment Pack</span>
                  </div>
                  <h2 className="text-lg font-bold text-white font-display">
                    05. Clean Repository Structure for Git + Railway
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Separates the PHP CodeIgniter backend (deployable on Railway with Apache + MySQL), the Node.js Socket/Aviator service, and the Android Studio project while excluding ~900 MB of build caches, nested <span className="font-mono">.git</span> packs, <span className="font-mono">phpmyadmin/</span>, and exposed keystores.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadGitRailwayScaffoldZip()}
                  className="px-4 py-2.5 text-xs font-semibold bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-2 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  Download Git + Railway Starter ZIP
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 text-xs font-semibold text-white">
                    Generated Repo Config Files ({scaffoldFiles.length})
                  </div>
                  <div className="divide-y divide-slate-800/70">
                    {scaffoldFiles.map((file) => {
                      const active = selectedScaffoldPath === file.path;
                      return (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => setSelectedScaffoldPath(file.path)}
                          className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                            active ? 'bg-slate-800/80 text-white' : 'hover:bg-slate-900/60 text-slate-300'
                          }`}
                        >
                          <div className="text-xs font-mono font-semibold text-sky-400">
                            {file.path}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                            {file.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-8 border border-slate-800 rounded-xl bg-slate-900/40 overflow-hidden flex flex-col">
                  {(() => {
                    const activeFile =
                      scaffoldFiles.find((f) => f.path === selectedScaffoldPath) || scaffoldFiles[0];
                    return (
                      <>
                        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-4">
                          <div>
                            <div className="text-xs font-mono font-bold text-white">
                              {activeFile.path}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {activeFile.description}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(activeFile.content);
                              setCopiedPath(activeFile.path);
                              setTimeout(() => setCopiedPath(null), 1800);
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                          >
                            {copiedPath === activeFile.path ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copy File
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[520px] leading-relaxed">
                          {activeFile.content}
                        </pre>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
