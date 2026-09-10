# Third-party notices

The MIT license covers this project's original code. Dependencies retain their own licenses. Exact resolved versions are recorded in `bun.lock`; installed packages contain their license texts. Preserve applicable notices when distributing a built app as well as source.

Desktop builds also resolve native dependencies through `src-tauri/Cargo.lock` and include their license texts, along with JavaScript dependency notices, in `THIRD_PARTY_LICENSES.txt` in the application's resources. This is generated from installed packages during `desktop:prepare`.

## Desktop runtime

The app uses Tauri 2 (MIT or Apache-2.0) and an unmodified Bun 1.3.14 runtime. Bun's license and linked-library notices are preserved in [licenses/Bun-1.3.14.md](licenses/Bun-1.3.14.md). Bun includes JavaScriptCore/WebKit under LGPL-2 and other separately licensed libraries; its [pinned source](https://github.com/oven-sh/bun/tree/bun-v1.3.14) and [upstream build instructions](https://github.com/oven-sh/bun/blob/bun-v1.3.14/CONTRIBUTING.md) are available for rebuilding the runtime. GEX Cockpit's complete source and desktop build scripts are included in this repository, and the backend can be recompiled with a modified Bun runtime using Bun's `--compile-executable-path` option. The application's MIT license does not replace dependency licenses or restrict modifying those components.

## TradingView Lightweight Charts

This app uses `lightweight-charts` 5.2.1 under Apache-2.0.

> TradingView Lightweight Charts™
> Copyright (с) 2025 TradingView, Inc.

[TradingView](https://www.tradingview.com/) · [Upstream NOTICE](https://github.com/tradingview/lightweight-charts/blob/v5.2.1/NOTICE) · [Apache-2.0 license](https://github.com/tradingview/lightweight-charts/blob/v5.2.1/LICENSE)

The application sidebar includes this notice and a TradingView link. Keep the chart attribution and sidebar notice when distributing changes. See the [upstream attribution instructions](https://tradingview.github.io/lightweight-charts/docs#license-and-attribution).

## Data and names

GexBot data, API access, names and third-party trademarks are not licensed by this repository. Users supply their own authorized data access. No affiliation or endorsement is implied. A source license does not grant permission to pool subscriptions, publish recorded market data or share a provider key with other users.
