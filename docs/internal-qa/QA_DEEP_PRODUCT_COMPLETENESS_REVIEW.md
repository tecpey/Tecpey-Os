# TecPey Deep Product Completeness QA / RedTeam

## Scope
- Student Dashboard
- AI Mentor widget and AI guide page
- Trading Simulator / Market Decision Practice
- Academy roadmap, specialized path, user-facing copy
- Internal-text leakage, prototype smell, empty states, trust and product completeness

## Critical findings fixed in this patch
1. **Build blocker in GlobalAiMentorWidget**: invalid function name `mentorLearning readiness` and duplicated ternary branch in fallback response. Fixed.
2. **Mentor fallback leakage**: user-facing copy exposed implementation mode like standard/fallback response. Reworded to a single product voice: Academy Mentor.
3. **Dashboard maturity gap**: Student Dashboard looked like progress cards only. Added professional student cartax, learning identity, certificate path, decision quality, mentor focus and conditional specialized review state.
4. **Simulator maturity gap**: Scenario list now has practice wallet, risk discipline, decision quality, practice journal and mentor-report framing so it feels like an evaluation engine, not a mock page.
5. **Internal/product-planning tone**: removed visible copy that sounded like a builder roadmap and replaced it with academy-facing language.

## Remaining hard launch gates
- Run `npm ci && npm run check && npm run build` on the target machine. This environment has no installed node_modules.
- Connect production market-board API values before launch.
- Connect auth/user identity for server-side cartax persistence beyond local progress.
- Replace any placeholder media with final approved academy assets/videos before public campaigns.

## RedTeam verdict
This patch moves the academy from MVP-feeling pages toward a cohesive product: learning record, mentor, simulator, specialized path and user identity now tell one story.
