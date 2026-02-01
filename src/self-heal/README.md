# @barrhawk/self-heal
**The Immune System of the Swarm.**

This package implements the self-healing selector logic that allows BarrHawk agents to survive UI changes without human intervention.

## 🧬 Core Logic: The Confidence Score
When a selector fails, the `SelfHealingManager` analyzes the current DOM and generates candidate matches, ranked by a confidence score:
1.  **Level 1 (ID/Data-TestID):** 95-100% confidence.
2.  **Level 2 (ARIA/Role):** 80-90% confidence.
3.  **Level 3 (Text/CSS Path):** 60-70% confidence.

## 💾 Persistence
Successful healings are serialized to `storage/healings.json`.
*   **The Architect Pattern:** Over time, these records identify "brittle" code areas, which can be used to automatically generate GitHub PRs to update the source code.

## 🔧 Configuration
```json
{
  "strategies": ["id", "data-testid", "aria-label", "text"],
  "minConfidence": 0.7,
  "persist": true
}
```
