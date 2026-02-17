"use client";

import { useState, useEffect, useCallback } from "react";

interface ScannedFile {
  filename: string;
  path: string;
  relativePath: string;
  size: number;
  format: string;
  modifiedAt: string;
  parsed: {
    seriesTitle: string;
    volumeNumber?: number;
    chapterNumber?: number;
    releaseGroup?: string;
  };
}

interface SeriesGroup {
  seriesTitle: string;
  cleanTitle: string;
  existingSeriesId?: number;
  files: ScannedFile[];
  totalSize: number;
  volumeCount: number;
}

interface ScanResponse {
  path: string;
  series: SeriesGroup[];
  totalFiles: number;
  totalSize: number;
}

interface ImportResponse {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  commandId: number;
}

export default function ImportPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const scanDownloads = useCallback(async () => {
    setIsScanning(true);
    setError(null);
    setScanResult(null);
    setImportResult(null);

    try {
      const res = await fetch("/api/v1/import/scan");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to scan downloads");
      }
      const data: ScanResponse = await res.json();
      setScanResult(data);
      // Select all series by default
      setSelectedSeries(new Set(data.series.map((s) => s.cleanTitle)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan downloads");
    } finally {
      setIsScanning(false);
    }
  }, []);

  const importSelected = async () => {
    if (!scanResult || selectedSeries.size === 0) return;

    setIsImporting(true);
    setError(null);

    try {
      // Get all file paths from selected series
      const selectedFiles = scanResult.series
        .filter((s) => selectedSeries.has(s.cleanTitle))
        .flatMap((s) => s.files.map((f) => f.path));

      const res = await fetch("/api/v1/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedFiles,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to import files");
      }

      const data: ImportResponse = await res.json();
      setImportResult(data);

      // Re-scan to update the list
      if (data.imported > 0) {
        await scanDownloads();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import files");
    } finally {
      setIsImporting(false);
    }
  };

  const toggleSeries = (cleanTitle: string) => {
    const newSelected = new Set(selectedSeries);
    if (newSelected.has(cleanTitle)) {
      newSelected.delete(cleanTitle);
    } else {
      newSelected.add(cleanTitle);
    }
    setSelectedSeries(newSelected);
  };

  const selectAll = () => {
    if (scanResult) {
      setSelectedSeries(new Set(scanResult.series.map((s) => s.cleanTitle)));
    }
  };

  const selectNone = () => {
    setSelectedSeries(new Set());
  };

  // Auto-scan on page load
  useEffect(() => {
    scanDownloads();
  }, [scanDownloads]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Import Existing Library</h1>
        <p className="text-zinc-400 mt-1">
          Scan your downloads folder and import files to your library
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            importResult.success
              ? "bg-green-900/30 border border-green-700 text-green-300"
              : "bg-yellow-900/30 border border-yellow-700 text-yellow-300"
          }`}
        >
          <p className="font-medium">
            {importResult.success
              ? `Successfully imported ${importResult.imported} file(s)`
              : `Imported ${importResult.imported} file(s) with ${importResult.failed} failure(s)`}
          </p>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 text-sm list-disc list-inside">
              {importResult.errors.slice(0, 5).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {importResult.errors.length > 5 && (
                <li>...and {importResult.errors.length - 5} more errors</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Loading State */}
      {isScanning && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
          <svg
            className="w-10 h-10 animate-spin mb-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-lg">Scanning downloads folder...</p>
        </div>
      )}

      {/* Scan Results */}
      {!isScanning && scanResult && (
        <>
          {scanResult.series.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <p className="text-lg">No importable files found in downloads folder</p>
              <p className="text-sm mt-2 text-zinc-500">{scanResult.path}</p>
              <button
                onClick={scanDownloads}
                className="mt-6 px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              >
                Rescan
              </button>
            </div>
          ) : (
            <>
              {/* Summary & Actions */}
              <div className="flex items-center justify-between mb-6 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <div className="text-zinc-300">
                  Found <span className="font-semibold text-white">{scanResult.totalFiles}</span> file(s) 
                  in <span className="font-semibold text-white">{scanResult.series.length}</span> series 
                  ({formatSize(scanResult.totalSize)})
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-2 text-sm">
                    <button
                      onClick={selectAll}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-600">|</span>
                    <button
                      onClick={selectNone}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Select None
                    </button>
                  </div>
                  <button
                    onClick={scanDownloads}
                    disabled={isScanning || isImporting}
                    className="px-4 py-2 text-sm font-medium text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Rescan
                  </button>
                  <button
                    onClick={importSelected}
                    disabled={isImporting || isScanning || selectedSeries.size === 0}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting
                      ? "Importing..."
                      : `Import ${selectedSeries.size} Series`}
                  </button>
                </div>
              </div>

              {/* Series List */}
              <div className="space-y-3">
                {scanResult.series.map((series) => (
                  <div
                    key={series.cleanTitle}
                    className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                      selectedSeries.has(series.cleanTitle)
                        ? "bg-blue-900/20 border-blue-700"
                        : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                    }`}
                    onClick={() => toggleSeries(series.cleanTitle)}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <div
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center mt-0.5 ${
                          selectedSeries.has(series.cleanTitle)
                            ? "bg-blue-600 border-blue-600"
                            : "border-zinc-600"
                        }`}
                      >
                        {selectedSeries.has(series.cleanTitle) && (
                          <svg
                            className="w-4 h-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>

                      {/* Series Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-medium text-white truncate">
                            {series.seriesTitle}
                          </h3>
                          {series.existingSeriesId && (
                            <span className="px-2 py-0.5 text-xs bg-green-900/50 text-green-400 rounded-full">
                              In Library
                            </span>
                          )}
                        </div>
                        <div className="flex gap-6 mt-1 text-sm text-zinc-400">
                          <span>{series.files.length} file(s)</span>
                          <span>{series.volumeCount} volume(s)</span>
                          <span>{formatSize(series.totalSize)}</span>
                        </div>
                        {/* Volume numbers preview */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {series.files
                            .filter((f) => f.parsed.volumeNumber !== undefined)
                            .slice(0, 15)
                            .map((f) => (
                              <span
                                key={f.path}
                                className="px-2 py-1 text-xs bg-zinc-700 text-zinc-300 rounded"
                              >
                                Vol. {f.parsed.volumeNumber}
                              </span>
                            ))}
                          {series.files.filter((f) => f.parsed.volumeNumber !== undefined).length > 15 && (
                            <span className="px-2 py-1 text-xs bg-zinc-700 text-zinc-500 rounded">
                              +{series.files.filter((f) => f.parsed.volumeNumber !== undefined).length - 15} more
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
