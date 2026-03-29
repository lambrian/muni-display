import {
  useDeferredValue,
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const LETTER_ENTRIES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((value) => ({
  key: value,
  kind: "character",
  label: value,
}));

const DIGIT_ENTRIES = "0123456789".split("").map((value) => ({
  key: value,
  kind: "character",
  label: value,
}));

const SPECIAL_ENTRIES = [" ", ".", "-", "/", ":"].map((value) => ({
  key: value,
  kind: "character",
  label: value,
}));

const COLOR_ENTRIES = [
  { key: "color:amber", kind: "color", label: "Amber", swatch: "#f0b352" },
  { key: "color:red", kind: "color", label: "Red", swatch: "#d8573c" },
  { key: "color:crimson", kind: "color", label: "Crimson", swatch: "#cc0033" },
  { key: "color:orange", kind: "color", label: "Orange", swatch: "#e58a3a" },
  { key: "color:khaki", kind: "color", label: "Khaki", swatch: "#f0e68c" },
  { key: "color:yellow", kind: "color", label: "Yellow", swatch: "#d7bf47" },
  { key: "color:lime", kind: "color", label: "Lime", swatch: "#99c24d" },
  { key: "color:green", kind: "color", label: "Green", swatch: "#4a9a62" },
  { key: "color:teal", kind: "color", label: "Teal", swatch: "#3b8d8d" },
  { key: "color:blue", kind: "color", label: "Blue", swatch: "#4676c7" },
  { key: "color:violet", kind: "color", label: "Violet", swatch: "#7759b5" },
  { key: "color:magenta", kind: "color", label: "Magenta", swatch: "#d100b8" },
  { key: "color:gray", kind: "color", label: "Gray", swatch: "#666666" },
  { key: "color:white", kind: "color", label: "White", swatch: "#f3efe4" },
];

const FLAP_SEQUENCE = [
  ...LETTER_ENTRIES,
  ...DIGIT_ENTRIES,
  ...SPECIAL_ENTRIES,
  ...COLOR_ENTRIES,
];

const ENTRY_INDEX = new Map(
  FLAP_SEQUENCE.map((entry, index) => [entry.key, index]),
);

const CHARACTER_INDEX = new Map(
  FLAP_SEQUENCE.filter((entry) => entry.kind === "character").map((entry, index) => [
    entry.key,
    index,
  ]),
);

const SWATCH_ALIASES = new Map(
  COLOR_ENTRIES.map((entry) => [entry.label.toLowerCase(), entry.key]),
);

const BLANK_INDEX = ENTRY_INDEX.get(" ") ?? 0;

function getStepCount(fromIndex, toIndex) {
  return toIndex >= fromIndex
    ? toIndex - fromIndex
    : FLAP_SEQUENCE.length - fromIndex + toIndex;
}

function getStepDuration(stepMs, remainingSteps) {
  return Math.max(stepMs + Math.min(remainingSteps * 4, 36), 90);
}

function normalizeCharacter(character) {
  return CHARACTER_INDEX.has(character) ? character : " ";
}

function normalizeCellToken(cell) {
  if (typeof cell === "string") {
    return cell
      .toUpperCase()
      .split("")
      .map((character) => normalizeCharacter(character));
  }

  if (cell && typeof cell === "object") {
    if (cell.blank) {
      return [" "];
    }

    if (typeof cell.char === "string") {
      return [normalizeCharacter(cell.char.toUpperCase().slice(0, 1) || " ")];
    }

    if (typeof cell.swatch === "string") {
      const swatchKey = cell.swatch.startsWith("color:")
        ? cell.swatch
        : SWATCH_ALIASES.get(cell.swatch.toLowerCase());
      return [swatchKey && ENTRY_INDEX.has(swatchKey) ? swatchKey : " "];
    }
  }

  return [" "];
}

function normalizeRowInput(rowInput) {
  if (typeof rowInput === "string") {
    return rowInput
      .toUpperCase()
      .split("")
      .map((character) => normalizeCharacter(character));
  }

  if (Array.isArray(rowInput)) {
    return rowInput.flatMap((cell) => normalizeCellToken(cell));
  }

  return [];
}

function padOrClipRow(keys, columns, align) {
  const clippedKeys = keys.slice(0, columns);
  const padding = Math.max(columns - clippedKeys.length, 0);
  const blanks = Array.from({ length: padding }, () => " ");

  return align === "right"
    ? [...blanks, ...clippedKeys]
    : [...clippedKeys, ...blanks];
}

function normalizePageInput(pageInput) {
  if (typeof pageInput === "string") {
    return pageInput.split(/\r?\n/);
  }

  if (Array.isArray(pageInput)) {
    return pageInput;
  }

  return [""];
}

function buildPages({
  columns,
  rows,
  value,
  rowsData,
  pages,
  paginate,
  align,
}) {
  const pageInputs = pages?.length
    ? pages
    : [rowsData?.length ? rowsData : value ?? ""];

  const normalizedPages = pageInputs.flatMap((pageInput) => {
    const normalizedRows = normalizePageInput(pageInput).map((rowInput) =>
      padOrClipRow(normalizeRowInput(rowInput), columns, align),
    );

    if (!paginate) {
      return [normalizedRows.slice(0, rows)];
    }

    const chunkCount = Math.max(Math.ceil(normalizedRows.length / rows), 1);
    return Array.from({ length: chunkCount }, (_, chunkIndex) => {
      const pageRows = normalizedRows.slice(chunkIndex * rows, (chunkIndex + 1) * rows);
      while (pageRows.length < rows) {
        pageRows.push(Array.from({ length: columns }, () => " "));
      }
      return pageRows;
    });
  });

  if (!normalizedPages.length) {
    return [Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "))];
  }

  return normalizedPages.map((pageRows) => {
    const filledRows = pageRows.slice(0, rows);
    while (filledRows.length < rows) {
      filledRows.push(Array.from({ length: columns }, () => " "));
    }
    return filledRows;
  });
}

function estimatePageTransitionDuration(fromPage, toPage, stepMs) {
  let longestDuration = 0;

  for (let rowIndex = 0; rowIndex < toPage.length; rowIndex += 1) {
    const fromRow = fromPage[rowIndex] ?? [];
    const toRow = toPage[rowIndex] ?? [];

    for (let columnIndex = 0; columnIndex < toRow.length; columnIndex += 1) {
      const fromIndex = ENTRY_INDEX.get(fromRow[columnIndex] ?? " ") ?? BLANK_INDEX;
      const toIndex = ENTRY_INDEX.get(toRow[columnIndex] ?? " ") ?? BLANK_INDEX;
      const steps = getStepCount(fromIndex, toIndex);

      let duration = 0;
      for (let step = 0; step < steps; step += 1) {
        duration += getStepDuration(stepMs, steps - step);
        if (step < steps - 1) {
          duration += 12;
        }
      }

      longestDuration = Math.max(longestDuration, duration);
    }
  }

  return longestDuration;
}

function renderEntryFace(entry) {
  if (entry.kind === "color") {
    return (
      <span
        className="split-flap-swatch"
        style={{ "--split-flap-swatch": entry.swatch }}
      />
    );
  }

  return (
    <span className="split-flap-character">
      {entry.label === " " ? "\u00A0" : entry.label}
    </span>
  );
}

function SplitFlapHalf({ position, entry, animated = false, style }) {
  return (
    <div
      className={[
        "split-flap-half",
        `split-flap-half-${position}`,
        animated ? "split-flap-half-animated" : "split-flap-half-static",
      ].join(" ")}
      style={style}
    >
      <div className="split-flap-face">{renderEntryFace(entry)}</div>
    </div>
  );
}

function SplitFlapCell({ targetIndex, stepMs }) {
  const [currentIndex, setCurrentIndex] = useState(targetIndex);
  const [frame, setFrame] = useState(null);
  const currentIndexRef = useRef(targetIndex);
  const targetIndexRef = useRef(targetIndex);
  const timersRef = useRef([]);

  const clearTimers = useEffectEvent(() => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  });

  const runStep = useEffectEvent((fromIndex) => {
    if (fromIndex === targetIndexRef.current) {
      setFrame(null);
      return;
    }

    const nextIndex = (fromIndex + 1) % FLAP_SEQUENCE.length;
    const remainingSteps = getStepCount(fromIndex, targetIndexRef.current);
    const duration = getStepDuration(stepMs, remainingSteps);
    const settleDelay = Math.max(duration - 24, 60);

    setFrame({ fromIndex, toIndex: nextIndex, duration });

    const settleTimer = window.setTimeout(() => {
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      setFrame(null);

      const continueTimer = window.setTimeout(() => {
        runStep(nextIndex);
      }, 12);

      timersRef.current.push(continueTimer);
    }, settleDelay);

    timersRef.current.push(settleTimer);
  });

  useEffect(() => {
    targetIndexRef.current = targetIndex;
    clearTimers();
    runStep(currentIndexRef.current);

    return () => {
      clearTimers();
    };
  }, [stepMs, targetIndex]);

  const settledEntry = FLAP_SEQUENCE[currentIndex];
  const activeFrame = frame
    ? {
        fromEntry: FLAP_SEQUENCE[frame.fromIndex],
        toEntry: FLAP_SEQUENCE[frame.toIndex],
        duration: frame.duration,
      }
    : null;

  return (
    <div className="split-flap-cell" aria-hidden="true">
      {activeFrame ? (
        <>
          <SplitFlapHalf position="top" entry={activeFrame.fromEntry} />
          <SplitFlapHalf position="bottom" entry={activeFrame.toEntry} />
          <SplitFlapHalf
            position="top"
            entry={activeFrame.fromEntry}
            animated
            style={{ animationDuration: `${activeFrame.duration}ms` }}
          />
          <SplitFlapHalf
            position="bottom"
            entry={activeFrame.toEntry}
            animated
            style={{ animationDuration: `${activeFrame.duration}ms` }}
          />
        </>
      ) : (
        <>
          <SplitFlapHalf position="top" entry={settledEntry} />
          <SplitFlapHalf position="bottom" entry={settledEntry} />
        </>
      )}
    </div>
  );
}

function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }

    const updateWidth = () => {
      setWidth(node.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, width];
}

export function SplitFlapDisplay({
  columns,
  rows = 1,
  value,
  rowsData,
  pages,
  paginate = true,
  page,
  defaultPage = 0,
  onPageChange,
  autoplay = false,
  autoplayIntervalMs = 1200,
  stepMs = 40,
  align = "left",
  fit = "width",
  label,
  className = "",
  style,
}) {
  const [containerRef, containerWidth] = useMeasuredWidth();
  const deferredContainerWidth = useDeferredValue(containerWidth);
  const normalizedPages = useMemo(
    () =>
      buildPages({
        columns,
        rows,
        value,
        rowsData,
        pages,
        paginate,
        align,
      }),
    [align, columns, paginate, pages, rows, rowsData, value],
  );

  const isControlledPage = typeof page === "number";
  const [internalPage, setInternalPage] = useState(defaultPage);
  const activePageIndex = isControlledPage
    ? Math.max(0, Math.min(page, normalizedPages.length - 1))
    : Math.max(0, Math.min(internalPage, normalizedPages.length - 1));
  const activePage = normalizedPages[activePageIndex];
  const previousPageRef = useRef(activePage);

  const setPageIndex = useEffectEvent((nextPage) => {
    const boundedPage = ((nextPage % normalizedPages.length) + normalizedPages.length) % normalizedPages.length;
    if (!isControlledPage) {
      setInternalPage(boundedPage);
    }
    onPageChange?.(boundedPage);
  });

  useEffect(() => {
    if (!isControlledPage && internalPage >= normalizedPages.length) {
      setInternalPage(0);
    }
  }, [internalPage, isControlledPage, normalizedPages.length]);

  useEffect(() => {
    if (!autoplay || normalizedPages.length <= 1) {
      previousPageRef.current = activePage;
      return undefined;
    }

    const previousPage = previousPageRef.current ?? activePage;
    const transitionMs = estimatePageTransitionDuration(previousPage, activePage, stepMs);
    previousPageRef.current = activePage;
    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setPageIndex(activePageIndex + 1);
      });
    }, Math.max(transitionMs + autoplayIntervalMs, autoplayIntervalMs));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePage, activePageIndex, autoplay, autoplayIntervalMs, normalizedPages.length, setPageIndex, stepMs]);

  const accessibleLabel = label ?? "Split flap display";
  const framePadding = 24;
  const gapPx = 4;
  const availableWidth = Math.max(deferredContainerWidth - framePadding * 2, 0);
  const fittedCellSize =
    columns > 0
      ? (availableWidth - gapPx * Math.max(columns - 1, 0)) / columns
      : 0;
  const resolvedCellSize =
    fit === "width"
      ? Math.max(18, Math.min(58, Number.isFinite(fittedCellSize) ? fittedCellSize : 38))
      : 58;

  return (
    <div
      ref={containerRef}
      className={`split-flap-display split-flap-display-framed ${className}`.trim()}
      role="img"
      aria-label={accessibleLabel}
      style={{
        "--split-flap-cell-size": `${resolvedCellSize}px`,
        "--split-flap-board-gap": `${gapPx}px`,
        width: fit === "width" ? "100%" : "max-content",
        ...style,
      }}
    >
      <div className="split-flap-board">
        {activePage.map((rowKeys, rowIndex) => (
          <div className="split-flap-row" key={rowIndex}>
            {rowKeys.map((key, columnIndex) => (
              <SplitFlapCell
                key={rowIndex * columns + columnIndex}
                targetIndex={ENTRY_INDEX.get(key) ?? BLANK_INDEX}
                stepMs={stepMs}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
