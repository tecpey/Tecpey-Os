# TecPey Academy Sync + Dark Mode Patch QA

## Applied fixes

1. Academy student dashboard and interactive roadmap now use the same official unlock logic:
   - A term is considered completed only when `tecpey-academy-term-N` contains a real quiz score and `percent === 100`.
   - Lesson reading progress can show learning progress, but it no longer marks a term as completed.
   - Locked terms show 0% and cannot be opened from the dashboard.

2. AI mentor coach center now follows the same official academy status:
   - Completed terms are counted from official end-of-term quiz results only.
   - Mentor recommendations no longer treat reading progress as a passed term.

3. Default site theme changed to dark mode:
   - First-time visitors see the landing in dark mode.
   - Users can still switch theme manually with the theme toggle.

## QA notes

- Build was not executed in this sandbox because `node_modules` is not included in the uploaded ZIP.
- Test on Mac after extraction:

```bash
npm install
npm run build
npm start
```

## Manual QA checklist

- Open `/academy` and `/academy/dashboard` after passing term 4 with 100%.
- Confirm both pages show terms 1-4 completed, term 5 in progress/unlocked, terms 6-7 locked.
- Open a fresh/incognito browser and confirm landing starts in dark mode.
- Confirm the theme toggle still switches light/dark.
