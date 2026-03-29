import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { SplitFlapDisplay } from "./components/SplitFlapDisplay";

const INITIAL_TEXT = `SEATTLE 10:42
LOS ANGELES 11:05
NEW ORLEANS 12:30
OAKLAND 13:10
TRACK 4 {GREEN}`;

const BOARD_PAGE = "board";
const MUNI_PAGE = "muni-eta";
const MUNI_FLAP_PAGE = "muni-flap";
const DEFAULT_STOP_CODE = "17360";
const SAVED_MUNI_STOPS_KEY = "muni-split-flap-stops";
const SAVED_MUNI_BOARD_ROWS_KEY = "muni-split-flap-rows";
const SAVED_MUNI_BOARD_COLUMNS_KEY = "muni-split-flap-columns";
const DEFAULT_BOARD_ROWS = 7;
const DEFAULT_BOARD_COLUMNS = 30;
const MUNI_PROXY_BASE = (import.meta.env.VITE_MUNI_API_BASE || "/api/muni").replace(
  /\/+$/,
  "",
);
const MUNI_PUBLIC_KEY = "0be8ebd0284ce712a63f29dcaf7798c4";
const POLL_INTERVAL_MS = 30_000;
const TRAIN_ROUTE_IDS = new Set(["J", "K", "L", "M", "N", "S", "T"]);
const ROUTE_SWATCHES = {
  J: "orange",
  K: "blue",
  L: "violet",
  M: "green",
  N: "amber",
  S: "white",
  T: "red",
};

function clampInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoardText(text) {
  const lines = String(text ?? "").split(/\r?\n/);

  return lines.map((line) => {
    const tokens = [];
    const tokenPattern = /\{([A-Z]+)\}/gi;
    let cursor = 0;
    let match = tokenPattern.exec(line);

    while (match) {
      const [rawToken, swatchName] = match;
      const tokenStart = match.index;

      if (tokenStart > cursor) {
        tokens.push(line.slice(cursor, tokenStart));
      }

      tokens.push({ swatch: swatchName.toLowerCase() });
      cursor = tokenStart + rawToken.length;
      match = tokenPattern.exec(line);
    }

    if (cursor < line.length) {
      tokens.push(line.slice(cursor));
    }

    return tokens.length ? tokens : [""];
  });
}

function buildAlignedBoardRow({ left = "", right = "", columns = 0 }) {
  const leftText = sanitizeFlapText(left).trimEnd();
  const rightText = sanitizeFlapText(right).trim();

  if (!rightText || columns <= 0) {
    return leftText;
  }

  const maxLeftLength = Math.max(columns - rightText.length - 1, 0);
  const clippedLeftText = leftText.slice(0, maxLeftLength);
  const combinedLength = clippedLeftText.length + rightText.length;
  const spacerLength = Math.max(columns - combinedLength, 1);

  return `${clippedLeftText}${" ".repeat(spacerLength)}${rightText}`;
}

function sanitizeFlapText(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/&/g, " ")
    .replace(/[^A-Z0-9 .\-/:]/g, " ");
}

function getPageFromHash(hash) {
  const page = hash.replace(/^#/, "");

  if (page === MUNI_PAGE || page === MUNI_FLAP_PAGE) {
    return page;
  }

  return BOARD_PAGE;
}

function buildMuniPredictionsUrl(stopCode) {
  const query = new URLSearchParams({ key: MUNI_PUBLIC_KEY });
  return `${MUNI_PROXY_BASE}/stopcodes/${encodeURIComponent(stopCode)}/predictions?${query}`;
}

function normalizeStopCode(value) {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function parseStoredStopCodes(value) {
  try {
    const parsed = JSON.parse(value ?? "[]");

    if (!Array.isArray(parsed)) {
      return [DEFAULT_STOP_CODE];
    }

    const normalized = parsed
      .map((stopCode) => normalizeStopCode(stopCode))
      .filter(Boolean)
      .filter((stopCode, index, collection) => collection.indexOf(stopCode) === index);

    return normalized.length ? normalized : [DEFAULT_STOP_CODE];
  } catch {
    return [DEFAULT_STOP_CODE];
  }
}

function parseStoredInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTrainPrediction(group) {
  return TRAIN_ROUTE_IDS.has(group?.route?.id);
}

function normalizeTrainTrips(groups) {
  return groups
    .filter((group) => isTrainPrediction(group))
    .flatMap((group) =>
      (group.values ?? [])
        .filter((prediction) => prediction.direction && prediction.minutes >= 0)
        .map((prediction) => ({
          id: [
            group.route.id,
            prediction.direction.id,
            prediction.tripId,
            prediction.minutes,
          ].join(":"),
          routeId: group.route.id,
          routeTitle: group.route.title,
          routeColor: `#${group.route.color ?? "bf2b45"}`,
          routeTextColor: `#${group.route.textColor ?? "ffffff"}`,
          stopName: group.stop.name,
          stopCode: group.stop.code,
          destination: prediction.direction.destinationName || prediction.direction.name,
          minutes: prediction.minutes,
          occupancy: prediction.occupancyDescription,
          vehicleId: prediction.vehicleId,
          affectedByLayover: prediction.affectedByLayover,
        })),
    )
    .sort((left, right) => left.minutes - right.minutes)
    .filter(
      (trip, index, collection) =>
        collection.findIndex(
          (candidate) =>
            candidate.routeId === trip.routeId &&
            candidate.destination === trip.destination &&
            candidate.minutes === trip.minutes,
        ) === index,
    );
}

function formatMinutes(minutes) {
  if (minutes === 0) {
    return "Arriving now";
  }

  return `${minutes} min`;
}

function formatTimestamp(value) {
  if (!value) {
    return "Waiting for live data";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBoardTime(value) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function chunkItems(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildFlapTripRow(trip) {
  return [
    { swatch: ROUTE_SWATCHES[trip.routeId] ?? "amber" },
    " ",
    trip.routeId,
    " ",
    trip.minutes === 0 ? "NOW" : `${trip.minutes}MIN`,
    " ",
    sanitizeFlapText(trip.destination),
  ];
}

function buildStopFlapPages({ stopResult, stopCode, rows }) {
  const headerTime = formatBoardTime(stopResult?.fetchedAt);
  const headerPrefix = `${headerTime} ${stopCode}`.trim();
  const stopName = sanitizeFlapText(stopResult?.stop?.name ?? `STOP ${stopCode}`);
  const tripRowsPerPage = Math.max(rows - 2, 1);
  const emptyRows = Math.max(rows - 2, 0);
  const singlePageHeader = {
    left: headerPrefix,
    right: "",
  };

  if (stopResult?.error) {
    return [[singlePageHeader, stopName, "LIVE FEED UNAVAILABLE", "TRY AGAIN SOON"].concat(
      Array.from({ length: Math.max(emptyRows - 2, 0) }, () => ""),
    )];
  }

  if (!stopResult) {
    return [[singlePageHeader, `LOADING STOP ${stopCode}`, "FETCHING LIVE TRAINS"].concat(
      Array.from({ length: Math.max(emptyRows - 1, 0) }, () => ""),
    )];
  }

  if (!stopResult.trips.length) {
    return [[singlePageHeader, stopName, "NO LIVE METRO ETA", "AT THIS STOP NOW"].concat(
      Array.from({ length: Math.max(emptyRows - 2, 0) }, () => ""),
    )];
  }

  const tripPages = chunkItems(stopResult.trips, tripRowsPerPage);

  return tripPages.map((pageTrips, pageIndex) => {
    const headerRow = headerPrefix;
    const pageRows = [
      { left: headerRow, right: "" },
      pageIndex === 0 ? stopName : `PAGE ${pageIndex + 1} OF ${tripPages.length}`,
      ...pageTrips.map((trip) => buildFlapTripRow(trip)),
    ];

    while (pageRows.length < rows) {
      pageRows.push("");
    }

    return pageRows;
  });
}

function buildMuniFlapPages({ stopCodes, stopResults, rows }) {
  return stopCodes.flatMap((stopCode) =>
    buildStopFlapPages({
      stopResult: stopResults[stopCode],
      stopCode,
      rows,
    }),
  );
}

function useMuniTrainPredictions(initialStopCode = DEFAULT_STOP_CODE) {
  const [inputStopCode, setInputStopCode] = useState(initialStopCode);
  const [activeStopCode, setActiveStopCode] = useState(initialStopCode);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPredictions = useEffectEvent(async (stopCode, { background = false } = {}) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setStatus("load");
    }

    setError("");

    try {
      const response = await fetch(buildMuniPredictionsUrl(stopCode));

      if (!response.ok) {
        throw new Error(`SFMTA returned ${response.status}`);
      }

      const payload = await response.json();
      const stop = payload[0]?.stop ?? {
        code: stopCode,
        name: `Stop #${stopCode}`,
      };

      setResult({
        stop,
        trips: normalizeTrainTrips(payload),
        fetchedAt: Date.now(),
      });
      setStatus("success");
    } catch (fetchError) {
      setStatus("error");
      setError(
        "Live ETAs could not be loaded. Run the app through the local Vite server so the Muni proxy can reach the realtime feed.",
      );
      console.error(fetchError);
    } finally {
      setIsRefreshing(false);
    }
  });

  useEffect(() => {
    fetchPredictions(activeStopCode);
  }, [activeStopCode]);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      fetchPredictions(activeStopCode, { background: true });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(refreshId);
  }, [activeStopCode]);

  const submitStopCode = (event) => {
    event.preventDefault();
    const nextStopCode = inputStopCode.replace(/\D/g, "").trim();

    if (!nextStopCode) {
      setError("Enter a valid Muni stop number.");
      return;
    }

    setActiveStopCode(nextStopCode);
  };

  const manualRefresh = () => {
    fetchPredictions(activeStopCode);
  };

  return {
    activeStopCode,
    error,
    inputStopCode,
    isRefreshing,
    manualRefresh,
    result,
    setInputStopCode,
    status,
    submitStopCode,
  };
}

function useStoredMuniStopCodes() {
  const [stopCodes, setStopCodes] = useState(() => {
    if (typeof window === "undefined") {
      return [DEFAULT_STOP_CODE];
    }

    return parseStoredStopCodes(window.localStorage.getItem(SAVED_MUNI_STOPS_KEY));
  });

  useEffect(() => {
    window.localStorage.setItem(SAVED_MUNI_STOPS_KEY, JSON.stringify(stopCodes));
  }, [stopCodes]);

  return [stopCodes, setStopCodes];
}

function useMultiMuniTrainPredictions(initialStopCodes) {
  const [stopCodes, setStopCodes] = useStoredMuniStopCodes();
  const [inputStopCode, setInputStopCode] = useState(initialStopCodes[0] ?? DEFAULT_STOP_CODE);
  const [resultsByStop, setResultsByStop] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const fetchPredictions = useEffectEvent(async (requestedStopCodes, { background = false } = {}) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setStatus("load");
    }

    setError("");

    try {
      const responses = await Promise.all(
        requestedStopCodes.map(async (stopCode) => {
          const response = await fetch(buildMuniPredictionsUrl(stopCode));

          if (!response.ok) {
            throw new Error(`SFMTA returned ${response.status} for stop ${stopCode}`);
          }

          const payload = await response.json();
          const stop = payload[0]?.stop ?? {
            code: stopCode,
            name: `Stop #${stopCode}`,
          };

          return [
            stopCode,
            {
              stop,
              trips: normalizeTrainTrips(payload),
              fetchedAt: Date.now(),
              error: "",
            },
          ];
        }),
      );

      setResultsByStop(Object.fromEntries(responses));
      setLastUpdatedAt(Date.now());
      setStatus("success");
    } catch (fetchError) {
      setStatus("error");
      setError(
        "Live ETAs could not be loaded. Run the app through the local Vite server so the Muni proxy can reach the realtime feed.",
      );
      setResultsByStop((current) =>
        Object.fromEntries(
          requestedStopCodes.map((stopCode) => [
            stopCode,
            {
              ...(current[stopCode] ?? {
                stop: { code: stopCode, name: `Stop #${stopCode}` },
                trips: [],
                fetchedAt: null,
              }),
              error: "Live feed unavailable",
            },
          ]),
        ),
      );
      console.error(fetchError);
    } finally {
      setIsRefreshing(false);
    }
  });

  useEffect(() => {
    if (!stopCodes.length) {
      return;
    }

    fetchPredictions(stopCodes);
  }, [stopCodes]);

  useEffect(() => {
    if (!stopCodes.length) {
      return undefined;
    }

    const refreshId = window.setInterval(() => {
      fetchPredictions(stopCodes, { background: true });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(refreshId);
  }, [stopCodes]);

  const addStopCode = (event) => {
    event.preventDefault();
    const nextStopCode = normalizeStopCode(inputStopCode);

    if (!nextStopCode) {
      setError("Enter a valid stop number.");
      return;
    }

    setStopCodes((current) =>
      current.includes(nextStopCode) ? current : [...current, nextStopCode],
    );
    setInputStopCode("");
  };

  const removeStopCode = (stopCodeToRemove) => {
    setStopCodes((current) => {
      const remainingStops = current.filter((stopCode) => stopCode !== stopCodeToRemove);
      return remainingStops.length ? remainingStops : [DEFAULT_STOP_CODE];
    });
  };

  const manualRefresh = () => {
    fetchPredictions(stopCodes);
  };

  return {
    error,
    inputStopCode,
    isRefreshing,
    lastUpdatedAt,
    manualRefresh,
    removeStopCode,
    resultsByStop,
    setInputStopCode,
    status,
    stopCodes,
    addStopCode,
  };
}

function BoardDemo() {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(24);
  const [text, setText] = useState(INITIAL_TEXT);
  const [pageIndex, setPageIndex] = useState(0);
  const parsedRows = parseBoardText(text);
  const totalPages = Math.max(Math.ceil(parsedRows.length / rows), 1);

  return (
    <>
      <div className="hero-copy">
        <p className="eyebrow">Retro Transit Display</p>
        <h1>Split-flap board with a board-first React API.</h1>
        <p className="lede">
          Set the board dimensions, paste multiline text, and the component
          handles clipping, blank unsupported characters, and page rotation.
        </p>
      </div>

      <div className="board-header">
        <span>{rows} Rows</span>
        <span>{columns} Columns</span>
        <span>
          Page {Math.min(pageIndex + 1, totalPages)} / {totalPages}
        </span>
      </div>

      <div className="board-stage">
        <SplitFlapDisplay
          rows={rows}
          columns={columns}
          rowsData={parsedRows}
          autoplay
          autoplayIntervalMs={1200}
          page={pageIndex}
          onPageChange={setPageIndex}
          stepMs={42}
          fit="width"
          label="Transit board demo"
        />
      </div>

      <div className="controls-panel">
        <div className="controls-grid">
          <label className="control-field">
            <span>Rows</span>
            <input
              type="number"
              min="1"
              max="12"
              value={rows}
              onChange={(event) => {
                setRows(clampInteger(event.target.value, 1));
                setPageIndex(0);
              }}
            />
          </label>

          <label className="control-field">
            <span>Columns</span>
            <input
              type="number"
              min="1"
              max="48"
              value={columns}
              onChange={(event) => {
                setColumns(clampInteger(event.target.value, 1));
                setPageIndex(0);
              }}
            />
          </label>
        </div>

        <label className="control-field control-field-textarea">
          <span>Board text</span>
          <textarea
            rows={8}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPageIndex(0);
            }}
          />
        </label>
        <p className="control-hint">
          Use tokens like <code>{`{GREEN}`}</code>, <code>{`{AMBER}`}</code>,
          or <code>{`{RED}`}</code> in the textarea to render swatch cells.
        </p>
      </div>
    </>
  );
}

function MuniStopForm({
  inputStopCode,
  setInputStopCode,
  submitStopCode,
  submitLabel = "Check ETAs",
}) {
  return (
    <form className="muni-form" onSubmit={submitStopCode}>
      <label className="control-field">
        <span>Stop number</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="17360"
          value={inputStopCode}
          onChange={(event) => {
            setInputStopCode(event.target.value.replace(/[^\d]/g, ""));
          }}
        />
      </label>

      <button className="muni-submit" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}

function MuniStatusBar({
  lastUpdatedAt,
  status,
  isRefreshing,
  manualRefresh,
  stopCount,
}) {
  return (
    <div className="muni-status-wrap">
      <div className="muni-status-actions">
        <p className="muni-status-note">Auto refresh every 30 seconds</p>
        <button className="muni-refresh-button" type="button" onClick={manualRefresh}>
          Refresh now
        </button>
      </div>

      <div className="muni-status">
      <div>
        <p className="muni-status-label">Saved stops</p>
        <strong>{stopCount}</strong>
      </div>
      <div>
        <p className="muni-status-label">Last update</p>
        <strong>{formatTimestamp(lastUpdatedAt)}</strong>
      </div>
      <div>
        <p className="muni-status-label">Feed status</p>
        <strong>
          {status === "load"
            ? "Loading"
            : status === "error"
              ? "Unavailable"
              : isRefreshing
                ? "Refreshing"
                : status === "success"
                  ? "Live"
          : "Idle"}
        </strong>
      </div>
      </div>
    </div>
  );
}

function MuniControlModal({
  boardColumns,
  boardRows,
  inputStopCode,
  isOpen,
  isRefreshing,
  lastUpdatedAt,
  manualRefresh,
  onClose,
  removeStopCode,
  setBoardColumns,
  setBoardRows,
  setInputStopCode,
  status,
  stopCodes,
  submitStopCode,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Muni board settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Board settings</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <MuniStopForm
          inputStopCode={inputStopCode}
          setInputStopCode={setInputStopCode}
          submitStopCode={submitStopCode}
          submitLabel="Add Stop"
        />

        <div className="saved-stop-list">
          {stopCodes.map((stopCode) => (
            <div className="saved-stop-chip" key={stopCode}>
              <span>#{stopCode}</span>
              <button
                type="button"
                className="saved-stop-remove"
                onClick={() => removeStopCode(stopCode)}
                aria-label={`Remove stop ${stopCode}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="modal-config-grid">
          <label className="control-field">
            <span>Rows</span>
            <input
              type="number"
              min="3"
              max="60"
              value={boardRows}
              onChange={(event) => {
                setBoardRows(clampInteger(event.target.value, DEFAULT_BOARD_ROWS));
              }}
            />
          </label>

          <label className="control-field">
            <span>Columns</span>
            <input
              type="number"
              min="12"
              max="48"
              value={boardColumns}
              onChange={(event) => {
                setBoardColumns(clampInteger(event.target.value, DEFAULT_BOARD_COLUMNS));
              }}
            />
          </label>
        </div>

        <MuniStatusBar
          lastUpdatedAt={lastUpdatedAt}
          status={status}
          isRefreshing={isRefreshing}
          manualRefresh={manualRefresh}
          stopCount={stopCodes.length}
        />
      </div>
    </div>
  );
}

function MuniEtaPage() {
  const {
    activeStopCode,
    error,
    inputStopCode,
    isRefreshing,
    manualRefresh,
    result,
    setInputStopCode,
    status,
    submitStopCode,
  } = useMuniTrainPredictions();

  const tripSummary = useMemo(() => {
    if (!result?.trips.length) {
      return "No live Muni Metro train predictions at this stop right now.";
    }

    return `${result.trips.length} live train arrival${result.trips.length === 1 ? "" : "s"} found`;
  }, [result]);

  return (
    <div className="muni-layout">
      <div className="hero-copy hero-copy--muni">
        <p className="eyebrow">San Francisco Muni</p>
        <h1>Live train ETAs by stop number.</h1>
        <p className="lede">
          Enter a public Muni stop number and this page fetches live Muni Metro
          arrivals for J, K, L, M, N, S, and T lines. Background refresh now
          runs every 30 seconds to keep the UI calmer between updates.
        </p>
      </div>

      <section className="muni-panel">
        <MuniStopForm
          inputStopCode={inputStopCode}
          setInputStopCode={setInputStopCode}
          submitStopCode={submitStopCode}
        />

        <MuniStatusBar
          activeStopCode={activeStopCode}
          result={result}
          status={status}
          isRefreshing={isRefreshing}
          manualRefresh={manualRefresh}
        />

        <div className="muni-stop-card">
          <p className="muni-stop-kicker">Stop</p>
          <h2>{result?.stop?.name ?? `Stop #${activeStopCode}`}</h2>
          <p className="muni-stop-meta">{tripSummary}</p>
        </div>

        {error ? <p className="muni-error">{error}</p> : null}

        <div className="muni-results">
          {(result?.trips ?? []).map((trip) => (
            <article className="eta-card" key={trip.id}>
              <div className="eta-card-top">
                <span
                  className="eta-route-badge"
                  style={{
                    backgroundColor: trip.routeColor,
                    color: trip.routeTextColor,
                  }}
                >
                  {trip.routeId}
                </span>
                <div>
                  <p className="eta-card-label">{trip.routeTitle}</p>
                  <h3>{trip.destination}</h3>
                </div>
              </div>

              <div className="eta-minutes">{formatMinutes(trip.minutes)}</div>

              <p className="eta-card-meta">
                {trip.occupancy || "Occupancy unavailable"}
                {trip.vehicleId ? ` · Train ${trip.vehicleId}` : ""}
                {trip.affectedByLayover ? " · Subject to layover" : ""}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MuniSplitFlapPage() {
  const {
    error,
    inputStopCode,
    isRefreshing,
    lastUpdatedAt,
    manualRefresh,
    removeStopCode,
    resultsByStop,
    setInputStopCode,
    status,
    stopCodes,
    addStopCode,
  } = useMultiMuniTrainPredictions([DEFAULT_STOP_CODE]);
  const [boardRows, setBoardRows] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_BOARD_ROWS;
    }

    return parseStoredInteger(
      window.localStorage.getItem(SAVED_MUNI_BOARD_ROWS_KEY),
      DEFAULT_BOARD_ROWS,
    );
  });
  const [boardColumns, setBoardColumns] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_BOARD_COLUMNS;
    }

    return parseStoredInteger(
      window.localStorage.getItem(SAVED_MUNI_BOARD_COLUMNS_KEY),
      DEFAULT_BOARD_COLUMNS,
    );
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const splitFlapPages = useMemo(
    () => buildMuniFlapPages({ stopCodes, stopResults: resultsByStop, rows: boardRows }),
    [boardRows, resultsByStop, stopCodes],
  );
  const boardPages = useMemo(
    () =>
      splitFlapPages.map((pageRows, globalPageIndex, allPages) =>
        pageRows.map((row) =>
          row && typeof row === "object" && !Array.isArray(row)
            ? buildAlignedBoardRow({
                ...row,
                right: `${globalPageIndex + 1}/${allPages.length}`,
                columns: boardColumns,
              })
            : row,
        ),
      ),
    [boardColumns, splitFlapPages],
  );

  useEffect(() => {
    setPageIndex(0);
  }, [boardColumns, boardRows, boardPages.length, stopCodes.join(",")]);

  useEffect(() => {
    const rows = boardPages[pageIndex] ?? [];
    console.log("[muni-board-page]", {
      page: pageIndex + 1,
      totalPages: boardPages.length,
      rows,
    });
  }, [boardPages, pageIndex]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_MUNI_BOARD_ROWS_KEY, String(boardRows));
  }, [boardRows]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_MUNI_BOARD_COLUMNS_KEY, String(boardColumns));
  }, [boardColumns]);

  return (
    <div className="muni-board-screen">
      {error ? <p className="muni-error muni-error-floating">{error}</p> : null}

      <div className="muni-board-shell">
        <div className="board-stage muni-board-stage">
          <div className="board-stage-frame">
            <SplitFlapDisplay
              rows={boardRows}
              columns={boardColumns}
              pages={boardPages}
              autoplay
              autoplayIntervalMs={8_000}
              page={pageIndex}
              onPageChange={setPageIndex}
              stepMs={42}
              fit="width"
              label={`Live Muni split-flap board for ${stopCodes.length} saved stops`}
            />
          </div>
        </div>
      </div>

      <div className="muni-minimal-bar">
        <button
          className="icon-button"
          type="button"
          onClick={() => setIsModalOpen(true)}
          aria-label="Open board settings"
        >
          ⋯
        </button>
      </div>

      <MuniControlModal
        boardColumns={boardColumns}
        boardRows={boardRows}
        inputStopCode={inputStopCode}
        isOpen={isModalOpen}
        isRefreshing={isRefreshing}
        lastUpdatedAt={lastUpdatedAt}
        manualRefresh={manualRefresh}
        onClose={() => setIsModalOpen(false)}
        removeStopCode={removeStopCode}
        setBoardColumns={setBoardColumns}
        setBoardRows={setBoardRows}
        setInputStopCode={setInputStopCode}
        status={status}
        stopCodes={stopCodes}
        submitStopCode={addStopCode}
      />
    </div>
  );
}

export default function App() {
  return (
    <main className="app-shell">
      <MuniSplitFlapPage />
    </main>
  );
}
