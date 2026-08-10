# TecPey Coin UI Assets

These files are runtime UI assets for cryptocurrency presentation surfaces. They are not TecPey brand marks and must not be used as TecPey trademarks, logos, downloadable asset packs, or resale materials.

## Sources

- `iconscout-3d/*.png`: selected coins from IconScout's "Free Cryptocurrency 3D Icon Pack" under the IconScout Digital License. Use these only inside TecPey product UI.
- `cryptocurrency-icons/*.svg`: selected CC0 fallback symbols from `spothq/cryptocurrency-icons`.
- `web3-icons/*.svg`: selected MIT fallback symbols generated from `@iconify-json/token-branded`.
- `official/*.svg`: reserved for assets copied from a project's official brand kit or website after source/license review.

## Runtime Rules

- Add new third-party assets through `src/data/coinGrowthCandidates.ts` or `src/lib/coin-visual-assets.ts`.
- Prefer the approved 3D pack when a coin exists there.
- Prefer verified official, CC0, or MIT token assets when the 3D pack does not include the coin.
- Keep unknown or unverified coins on TecPey's generated vector fallback until a source is approved.
- Content pages may be generated automatically, but trading/deposit/withdrawal enablement must remain behind manual risk and compliance review.
