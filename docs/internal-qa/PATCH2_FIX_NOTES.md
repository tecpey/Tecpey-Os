# Patch 2 fixes

## Fixed after user QA
- Academy progress now counts both:
  - completed lessons
  - correct quick-check answers
- Each correct quick-check answer automatically marks that lesson complete.
- Each term writes `tecpey-academy-term-X` to localStorage with percent/passed state.
- Term cards listen for academy progress update events, storage events and focus changes.
- Knowledge Center dropdown in Navbar now includes Trader Toolbox / جعبه ابزار معامله‌گر.
- Static coin pages now show a detailed market-data explanation and link to the live crypto tab.
- Dynamic crypto tab now has clearer Market Cap / FDV / Volume / Supply interpretation and a taller default view.
