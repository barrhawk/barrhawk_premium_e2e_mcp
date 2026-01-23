# The Frankenstack Guide: Taming the Multi-Language Beast

## The Challenge

We are building **Barrhawk**, an autonomous QA platform. To achieve the reliability and performance we need, we are not sticking to a single language. We are building a **Frankenstack**:

*   **TypeScript (Bun/Node):** For the "Brain" (Doctor), Dynamic Tools (Frankenstein), and Dashboard (Next.js). It's flexible and ecosystem-rich.
*   **Rust/Go/Dart:** For the "Bridge" – the immutable microkernel that ensures the system *never* dies, even if the JS runtime segfaults.

**The Problem:** Managing build pipelines, IPC (Inter-Process Communication), and developer experience across four languages is usually a nightmare.

## The Architecture: Why Do This?

```
┌─────────────┐
│   BRIDGE    │  <-- The "Indestructible" Kernel (Rust/Go/Dart)
│             │      - Rate Limiter
│             │      - Circuit Breaker
│             │      - Metric Collector
└──────┬──────┘
       │ Stdio / HTTP / WebSocket
       ▼
┌─────────────┐
│   DOCTOR    │  <-- The "Brain" (TypeScript - Primary Supervisor)
│             │      - MCP Interface
│             │      - Router
└──────┬──────┘
       │
       ▼
┌──────┴──────┐
│             │
▼             ▼
┌─────────┐  ┌──────────────┐
│  IGOR   │  │ FRANKENSTEIN │  <-- The "Hands" (TypeScript - Secondary Supervisors)
│         │  │              │
│ Stable  │  │ Experimental │
│ Cached  │  │ Hot-reload   │
└─────────┘  └──────────────┘
```

We accept the complexity of the stack to gain:
1.  **Fault Tolerance:** If `Frankenstein` (running user code) crashes, `Doctor` restarts it. If `Doctor` crashes, `Bridge` restarts it.
2.  **Performance:** `Bridge` handles high-volume metric ingestion without GC pauses.
3.  **Safety:** Experimental tools run in a completely isolated process (`Frankenstein`).

## Migration Path to Full Frankenstack

We are currently at **Step 1 (Beta)**. Here is the road ahead.

### 1. The Beta (Current State)
We use a **Two-Tier** TypeScript system.
*   **Primary:** Acts as a proto-Doctor. Handles MCP.
*   **Secondary:** Acts as a combined Igor/Frankenstein. Handles tools.
*   **Bridge:** None. We rely on Bun's supervisor capabilities.

**Action:** Ship this. It proves the "Supervisor" pattern works.

### 2. The Bridge Integration (Next Step)
We need to introduce the **Bridge** without breaking the Beta.
*   **Decision:** We must pick **ONE** language for the official Bridge implementation initially. Based on the `langtest/` folder, **Rust** or **Go** are the top contenders for performance.
*   **Implementation:**
    1.  Compile the Bridge binary.
    2.  Modify the MCP config to launch the *Bridge* instead of the Primary JS process.
    3.  The Bridge spawns the Primary JS process.
    4.  The Bridge proxies Stdio from the client to the Primary, while intercepting specific control signals.

### 3. The Split (Igor vs. Frankenstein)
Once the Bridge is stable, we split the Secondary.
*   **Igor:** A static, optimized runtime for core tools (Filesystem, Browser control).
*   **Frankenstein:** A dynamic, `bun --hot` runtime for user-generated tools and AI experiments.
*   **Doctor:** Needs a router update to send traffic to the correct subprocess.

## Managing the Chaos (Practical Tips)

### 1. Unified Build System
Do not run `cargo build`, `go build`, and `bun build` manually.
*   Use `nut.sh` or a `Makefile` as the single entry point.
*   Example: `bun run build:all` should trigger the Rust/Go builds.

### 2. Artifact Hygiene
*   **NEVER** commit build artifacts (`target/`, `bin/`, `*.o`, `*.rlib`).
*   **CI Checks:** Add a pre-commit hook or CI step that fails if binary files are detected in the diff.

### 3. Contract Testing
*   The protocol between Bridge and Doctor must be versioned.
*   Use `langtest/protocol/bridge-message.schema.json` as the source of truth.
*   Run integration tests that specifically check if the Bridge correctly restarts a crashing Doctor.

### 4. Logging & Observability
*   When you have 3+ processes, `console.log` is useless.
*   Use structured logging (JSON).
*   The Bridge should aggregate logs from Doctor, Igor, and Frankenstein and emit them in a unified stream (or to the `observability` package).

## Future Proofing
The Frankenstack allows us to swap components. If Bun becomes unstable, we can swap `Igor` to Deno or Node.js without changing the `Bridge` or the `Doctor` logic. This architecture is our insurance policy against ecosystem churn.
