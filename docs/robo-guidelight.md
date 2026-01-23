# Robo-Guidelight: The Soul of Barrhawk

## The Pivot: From Scripts to Sentience

We started by writing E2E scripts. They broke. We fixed them. They broke again.
We realized that **testing is not a scripting problem. It is an agentic problem.**

Standard CI/CD is "fire and forget." You run a script, it fails, you get a log.
**Barrhawk** is "fire and supervise." You run an intention ("Login to the app"), and the system:
1.  **Observes:** It watches the DOM, the network, and the console.
2.  **Reacts:** If a selector fails, it tries another. If the API 503s, it waits.
3.  **Heals:** It rewrites its own instructions if the app has drifted.

## The Architecture of Resilience

To achieve this, we had to leave the "monolithic test runner" behind.
We built the **Tripartite Architecture**:

*   **The Bridge (Survival):** A microkernel that cannot die. It ensures the agent survives the crash of the tool it is wielding.
*   **The Doctor (Intelligence):** The strategic layer. It decides *what* to do next.
*   **Frankenstein (Adaptability):** The tactical layer. It runs the code, risking death so the Doctor doesn't have to.

## R&D to Engineering

We spent weeks in the "Lab" (`dump/`, `experiencegained/`, `battlerecords/`). We generated ideas faster than code.
Today, 2026-01-23, marks the transition to the "Factory."
*   We archived the noise.
*   We codified the "FakeSaaS" to test our own testing tools.
*   We built "Primary/Secondary" supervisors as the first step towards the full Tripartite vision.

## The North Star: Observability

The dashboard is not just a report card. It is a window into the agent's mind.
When a test fails, we don't just show a stack trace. We show:
*   **What the agent saw** (Video/Screenshots).
*   **What the agent thought** (Logs/Events).
*   **What the agent tried** (Retries/Heals).

This is the "Premium" in Barrhawk E2E Premium MCP. We sell **confidence**, not just checkmarks.

## A Note to the Maintainers

This codebase is a "Frankenstack." It uses Rust, Go, TypeScript, and Bun. It is complex.
**Do not fear the complexity.** Embrace it. It is the cost of building a system that is more reliable than the applications it tests.
Keep the `Bridge` simple. Keep the `Doctor` smart. Keep `Frankenstein` contained.

*   *Hawk*
