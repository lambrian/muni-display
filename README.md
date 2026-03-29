# Transit Flipboard

A React split-flap board component with row/column layout, automatic paging, and color swatch cells.

## Component

```jsx
import { SplitFlapDisplay } from "./src/components/SplitFlapDisplay";
```

## Quick Start

```jsx
<SplitFlapDisplay
  rows={3}
  columns={24}
  value={`SEATTLE 10:42
LOS ANGELES 11:05
OAKLAND 13:10`}
/>
```

## Props

### `columns`

```ts
columns: number
```

Number of flap cells per row.

### `rows`

```ts
rows?: number
```

Defaults to `1`.

### `value`

```ts
value?: string | string[]
```

Supports:
- a single string
- a multiline string using `\n`
- an array of row strings

Unsupported characters render as blank cells.

### `rowsData`

```ts
rowsData?: CellValue[][]
```

Structured row input for a single board page.

Example:

```jsx
<SplitFlapDisplay
  rows={2}
  columns={16}
  rowsData={[
    ["TRACK", " ", { swatch: "amber" }],
    ["READY", " ", { swatch: "green" }],
  ]}
/>
```

### `pages`

```ts
pages?: Array<string | string[] | CellValue[][]>
```

Explicit page input. When supplied, `pages` takes precedence over `value` and `rowsData`.

### `paginate`

```ts
paginate?: boolean
```

Defaults to `true`.

If enabled, extra rows become additional pages. If disabled, extra rows are clipped.

### `page`

```ts
page?: number
```

Controlled page index.

### `defaultPage`

```ts
defaultPage?: number
```

Initial page for uncontrolled paging.

### `onPageChange`

```ts
onPageChange?: (page: number) => void
```

Called when autoplay or app state changes the active page.

### `autoplay`

```ts
autoplay?: boolean
```

Defaults to `false`.

Automatically rotates pages after the current flip sequence settles.

### `autoplayIntervalMs`

```ts
autoplayIntervalMs?: number
```

Extra delay after a page transition completes.

### `stepMs`

```ts
stepMs?: number
```

Defaults to `40`.

Controls the speed of each flap step.

### `align`

```ts
align?: "left" | "right"
```

Defaults to `"left"`.

### `fit`

```ts
fit?: "width" | "none"
```

Defaults to `"width"`.

- `"width"` shrinks cells to fit available horizontal space when possible
- `"none"` preserves natural size and allows overflow

### `label`

```ts
label?: string
```

Accessible label for the board.

### `className`

```ts
className?: string
```

### `style`

```ts
style?: React.CSSProperties
```

## CellValue

```ts
type CellValue =
  | string
  | { char: string }
  | { swatch: SwatchName }
  | { blank: true };
```

## Swatch Names

Supported swatches:

- `amber`
- `red`
- `orange`
- `yellow`
- `lime`
- `green`
- `teal`
- `blue`
- `violet`
- `white`

## Behavior

- The board always renders exactly `rows * columns` cells per page.
- The board never wraps.
- Long lines are clipped.
- Unsupported characters display as blanks.
- Paging is row-based.
- Flap animation advances through the full internal sequence, including swatches.

## Development

```bash
npm install
npm run dev
```
