# DashMax Specification

**Component:** DashMax (Premium Dashboard)
**Role:** Professional-Grade Observability UI
**Tech:** Flutter Desktop | Tauri + SvelteKit | Electron + React

---

## Purpose

DashMax is the **premium cockpit** for BarrHawk. Same data, same WebSocket, same Bridge connection - but with a native desktop experience, buttery animations, and the kind of UI that makes clients say "holy shit."

While `dash` is functional, `dashmax` is **impressive**.

---

## Tech Options

| Framework | Pros | Cons | Vibe |
|-----------|------|------|------|
| **Flutter Desktop** | Single codebase, smooth 120fps, native compilation | Dart learning curve | Premium, Apple-like |
| **Tauri + SvelteKit** | Tiny binary (~3MB), Rust backend, web UI | Newer ecosystem | Modern, minimal |
| **Electron + React** | Huge ecosystem, easy | 150MB+ binary, RAM hog | Corporate, safe |

**Recommendation:** Flutter for the "looks nicer" factor. Native rendering, no web jank.

---

## Design Language

### Aesthetic: "Mission Control meets Bloomberg Terminal"

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░                                                                          ░░  │
│  ░░   B A R R H A W K                              ⚡ LIVE   ● 3 IGORS      ░░  │
│  ░░   ═══════════════                                                        ░░  │
│  ░░                                                                          ░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                                  │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃                            ┃  ┃                                         ┃  │
│  ┃         B R I D G E        ┃  ┃              D O C T O R                ┃  │
│  ┃                            ┃  ┃                                         ┃  │
│  ┃    ╭─────────────────╮    ┃  ┃    ┌─────────────────────────────┐     ┃  │
│  ┃    │   ◉ CONNECTED   │    ┃  ┃    │  Tasks      ████████░░ 84%  │     ┃  │
│  ┃    │   2h 47m uptime │    ┃  ┃    │  Queue      ▁▂▃▅▆▇██▇▅▃▂▁  │     ┃  │
│  ┃    ╰─────────────────╯    ┃  ┃    │  Igors      ●●●●○○○○ 4/8   │     ┃  │
│  ┃                            ┃  ┃    └─────────────────────────────┘     ┃  │
│  ┃    ┌──────┐  ┌──────┐     ┃  ┃                                         ┃  │
│  ┃    │ 1.2K │  │ 847  │     ┃  ┃    Swarms                               ┃  │
│  ┃    │  IN  │  │ OUT  │     ┃  ┃    ╭───────────────────────────────╮   ┃  │
│  ┃    └──────┘  └──────┘     ┃  ┃    │ ◐ a11y-audit          67%    │   ┃  │
│  ┃                            ┃  ┃    │   ━━━━━━━━━━━━━━━━░░░░░░░░   │   ┃  │
│  ┃    ▂▃▅▆▇█▇▅▃▂▁▂▃▅▆▇█▇▅   ┃  ┃    ╰───────────────────────────────╯   ┃  │
│  ┃     throughput (1m)       ┃  ┃                                         ┃  │
│  ┃                            ┃  ┃                                         ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                                                                  │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃                              I G O R S                                    ┃  │
│  ┃                                                                           ┃  │
│  ┃   ╭──────────────╮  ╭──────────────╮  ╭──────────────╮  ╭────────────╮  ┃  │
│  ┃   │              │  │              │  │              │  │            │  ┃  │
│  ┃   │   🌐  001    │  │   🗄️  002    │  │   🐙  003    │  │  + SPAWN   │  ┃  │
│  ┃   │              │  │              │  │              │  │            │  ┃  │
│  ┃   │  ████████░░  │  │  ░░░░░░░░░░  │  │  ██████░░░░  │  │            │  ┃  │
│  ┃   │   BUSY 2.3s  │  │    IDLE      │  │   BUSY 0.8s  │  │            │  ┃  │
│  ┃   │              │  │              │  │              │  │            │  ┃  │
│  ┃   │  127MB  2pg  │  │  45MB  3cn   │  │  52MB  5req  │  │            │  ┃  │
│  ┃   │              │  │              │  │              │  │            │  ┃  │
│  ┃   ╰──────────────╯  ╰──────────────╯  ╰──────────────╯  ╰────────────╯  ┃  │
│  ┃                                                                           ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                                                                  │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃  F R A N K E N S T R E A M                      🔍 Filter   ⏸ Pause     ┃  │
│  ┃  ─────────────────────────────────────────────────────────────────────── ┃  │
│  ┃                                                                           ┃  │
│  ┃  14:32:05.123   BRIDGE    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━▶  mcp:request    ┃  │
│  ┃  14:32:05.125   DOCTOR    ─────────────▶ igor-001       task:dispatch   ┃  │
│  ┃  14:32:05.127   IGOR-001  ●                             task:start      ┃  │
│  ┃  14:32:05.892   IGOR-001  ✓ 765ms                       task:complete   ┃  │
│  ┃  14:32:05.894   DOCTOR    ◀─────────────                task:response   ┃  │
│  ┃  14:32:05.896   BRIDGE    ◀━━━━━━━━━━━━━━━━━━━━━━━━━━━━  mcp:response   ┃  │
│  ┃                                                                           ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Visual Features (What Makes It "Max")

### 1. Animated Flow Lines

Instead of static logs, show data flowing:

```
BRIDGE ━━━━━━━━━●━━━━━━━━▶ DOCTOR ─────●─────▶ IGOR
       ◀━━━━━━━━━━━━━━━━━━        ◀────────────
```

- Dots animate along the lines
- Speed indicates throughput
- Color indicates health (green/yellow/red)

### 2. Glassmorphism Panels

```css
/* Frosted glass effect */
.panel {
  background: rgba(15, 23, 42, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow:
    0 4px 30px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
```

### 3. Micro-Interactions

| Element | Interaction |
|---------|-------------|
| Igor cards | Hover: lift + glow, Click: expand details |
| Progress bars | Smooth animated fill |
| Status dots | Pulse animation when active |
| Buttons | Ripple effect on click |
| Stream entries | Slide in from right |
| Numbers | Count-up animation on change |

### 4. Particle Background

Subtle floating particles in the background that:
- Drift slowly upward
- Speed up when throughput is high
- Turn red during errors
- Completely optional (toggle in settings)

### 5. Sound Design (Optional)

| Event | Sound |
|-------|-------|
| Task complete | Soft chime |
| Error | Low warning tone |
| Igor spawn | Whoosh |
| Swarm complete | Achievement sound |
| Connection lost | Alert beep |

Muted by default, enable in settings.

---

## Igor Cards - Expanded View

Click an Igor card to expand:

```
╭─────────────────────────────────────────────────────────────────╮
│                                                                  │
│   🌐  IGOR-001                                        ● BUSY    │
│   ══════════════════════════════════════════════════════════    │
│                                                                  │
│   Domain: Browser                    PID: 12847                 │
│   Uptime: 1h 23m                     Memory: 127MB              │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Resources                                               │   │
│   │                                                          │   │
│   │  Browser Pages    ██░░░░░░░░  2/10                      │   │
│   │  Contexts         █░░░░░░░░░  1/5                       │   │
│   │  Memory           ████████░░  127/150 MB                │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Current Task                                            │   │
│   │                                                          │   │
│   │  browser_screenshot                                      │   │
│   │  Started: 2.3s ago                                       │   │
│   │  Args: { "fullPage": true, "savePath": "/tmp/..." }     │   │
│   │                                                          │   │
│   │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░ elapsed      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Stats (last hour)                                       │   │
│   │                                                          │   │
│   │  Tasks: 147 completed, 2 failed                         │   │
│   │  Avg Duration: 234ms                                     │   │
│   │                                                          │   │
│   │  ▁▂▃▅▆▇█▇▅▃▂▁▂▃▅▆▇█▇▅▃▂▁▂▃▅▆▇█▇▅▃▂▁  throughput        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌────────────┐  ┌────────────┐  ┌────────────────────────┐   │
│   │   ⏹ KILL   │  │  📋 LOGS   │  │  🔄 RESTART            │   │
│   └────────────┘  └────────────┘  └────────────────────────┘   │
│                                                                  │
╰─────────────────────────────────────────────────────────────────╯
```

---

## Swarm Visualization

When a swarm is running, show it properly:

```
╭─────────────────────────────────────────────────────────────────╮
│                                                                  │
│   ◐  SWARM: a11y-audit                              67% (67/100)│
│   ════════════════════════════════════════════════════════════  │
│                                                                  │
│                           DOCTOR                                 │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                   │
│              ▼               ▼               ▼                   │
│         ╭────────╮     ╭────────╮     ╭────────╮                │
│         │ 001 🌐 │     │ 002 🌐 │     │ 003 🌐 │                │
│         │  pg 23 │     │  pg 24 │     │  pg 25 │                │
│         │ ██████ │     │ █████░ │     │ ████░░ │                │
│         ╰────────╯     ╰────────╯     ╰────────╯                │
│                                                                  │
│   Pages: ████████████████████████████████░░░░░░░░░░░░░░░░░░░   │
│          1    10    20    30    40    50    60    70    80  100 │
│                                                                  │
│   Time Elapsed: 2m 34s          Est. Remaining: 1m 15s          │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Results so far:                                         │   │
│   │  • 234 issues found                                      │   │
│   │  • 12 critical, 45 major, 177 minor                     │   │
│   │  • Worst page: /checkout (23 issues)                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌────────────┐  ┌────────────┐                                │
│   │  ⏸ PAUSE   │  │  ⏹ CANCEL  │                                │
│   └────────────┘  └────────────┘                                │
│                                                                  │
╰─────────────────────────────────────────────────────────────────╯
```

---

## Color System

```dart
// Flutter color scheme
class BarrHawkColors {
  // Backgrounds
  static const bg = Color(0xFF0A0E17);           // Near black
  static const bgPanel = Color(0xFF0F172A);      // Slate 900
  static const bgCard = Color(0xFF1E293B);       // Slate 800
  static const bgHover = Color(0xFF334155);      // Slate 700

  // Accents
  static const bridge = Color(0xFF3B82F6);       // Blue 500
  static const doctor = Color(0xFF8B5CF6);       // Violet 500
  static const igor = Color(0xFF10B981);         // Emerald 500
  static const stream = Color(0xFF6366F1);       // Indigo 500

  // Status
  static const ok = Color(0xFF22C55E);           // Green 500
  static const warning = Color(0xFFF59E0B);      // Amber 500
  static const error = Color(0xFFEF4444);        // Red 500
  static const idle = Color(0xFF64748B);         // Slate 500

  // Text
  static const textPrimary = Color(0xFFF1F5F9);  // Slate 100
  static const textSecondary = Color(0xFF94A3B8);// Slate 400
  static const textMuted = Color(0xFF64748B);    // Slate 500

  // Gradients
  static const heroGradient = LinearGradient(
    colors: [Color(0xFF3B82F6), Color(0xFF8B5CF6)],
  );
}
```

---

## Typography

```dart
class BarrHawkTypography {
  // Headers
  static const h1 = TextStyle(
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.5,
  );

  // Monospace (code, logs, stats)
  static const mono = TextStyle(
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    fontWeight: FontWeight.w400,
  );

  // Status labels
  static const label = TextStyle(
    fontFamily: 'Inter',
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.5,
  );
}
```

---

## Flutter Widget Structure

```dart
// Main app structure
class DashMaxApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: barrhawkDarkTheme,
      home: DashMaxShell(
        child: DashMaxLayout(
          bridge: BridgePanel(),
          doctor: DoctorPanel(),
          igors: IgorsPanel(),
          stream: FrankenstreamPanel(),
        ),
      ),
    );
  }
}

// State management
class DashMaxState extends ChangeNotifier {
  BridgeState bridge = BridgeState.empty();
  DoctorState doctor = DoctorState.empty();
  Map<String, IgorState> igors = {};
  List<StreamEvent> stream = [];

  late WebSocketChannel _ws;

  void connect(String url) {
    _ws = WebSocketChannel.connect(Uri.parse(url));
    _ws.stream.listen(_handleEvent);
  }

  void _handleEvent(dynamic data) {
    final event = jsonDecode(data);
    switch (event['type']) {
      case 'bridge:stats':
        bridge = BridgeState.fromJson(event['data']);
        break;
      case 'igor:state':
        igors[event['data']['id']] = IgorState.fromJson(event['data']);
        break;
      case 'stream':
        stream.insert(0, StreamEvent.fromJson(event['data']));
        if (stream.length > 1000) stream.removeLast();
        break;
      // ... etc
    }
    notifyListeners();
  }

  void sendCommand(DashboardCommand cmd) {
    _ws.sink.add(jsonEncode(cmd.toJson()));
  }
}
```

---

## Animations

### Igor Card Spawn

```dart
class IgorCardSpawn extends StatefulWidget {
  @override
  _IgorCardSpawnState createState() => _IgorCardSpawnState();
}

class _IgorCardSpawnState extends State<IgorCardSpawn>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scale;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: Duration(milliseconds: 400),
      vsync: this,
    );
    _scale = Tween(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
    );
    _opacity = Tween(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
    _controller.forward();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scale.value,
          child: Opacity(
            opacity: _opacity.value,
            child: IgorCard(igor: widget.igor),
          ),
        );
      },
    );
  }
}
```

### Progress Bar Shimmer

```dart
class ShimmerProgressBar extends StatelessWidget {
  final double progress;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Background
        Container(
          height: 8,
          decoration: BoxDecoration(
            color: BarrHawkColors.bgCard,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        // Fill
        FractionallySizedBox(
          widthFactor: progress,
          child: Container(
            height: 8,
            decoration: BoxDecoration(
              gradient: BarrHawkColors.heroGradient,
              borderRadius: BorderRadius.circular(4),
            ),
            child: ShimmerOverlay(), // Animated shine effect
          ),
        ),
      ],
    );
  }
}
```

---

## Window Management

Desktop app features:

```dart
// Custom window frame (no native title bar)
class DashMaxWindow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Custom title bar
        GestureDetector(
          onPanStart: (_) => windowManager.startDragging(),
          child: Container(
            height: 40,
            color: BarrHawkColors.bg,
            child: Row(
              children: [
                SizedBox(width: 16),
                Text('BarrHawk DashMax', style: BarrHawkTypography.label),
                Spacer(),
                WindowButton(icon: Icons.minimize, onTap: () => windowManager.minimize()),
                WindowButton(icon: Icons.crop_square, onTap: () => windowManager.maximize()),
                WindowButton(icon: Icons.close, onTap: () => windowManager.close(), isClose: true),
              ],
            ),
          ),
        ),
        // App content
        Expanded(child: DashMaxLayout()),
      ],
    );
  }
}
```

---

## Keyboard Shortcuts

Same as dash, plus:

| Key | Action |
|-----|--------|
| `Cmd/Ctrl + 1-4` | Focus panels |
| `Cmd/Ctrl + K` | Command palette |
| `Cmd/Ctrl + ,` | Settings |
| `Cmd/Ctrl + L` | Toggle layout (vertical/horizontal) |
| `Space` | Pause/resume stream |
| `Cmd/Ctrl + F` | Search in stream |

---

## Command Palette

Press `Cmd+K`:

```
╭─────────────────────────────────────────────────────────────────╮
│  🔍  Type a command...                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ▶  Restart Doctor                                              │
│     Kill igor-001                                                │
│     Spawn new Igor                                               │
│     Create Squad                                                 │
│     Cancel Swarm: a11y-audit                                    │
│     Toggle Dark Mode                                             │
│     Export Logs                                                  │
│     Open Settings                                                │
│                                                                  │
╰─────────────────────────────────────────────────────────────────╯
```

---

## Settings Panel

```
╭─────────────────────────────────────────────────────────────────╮
│  ⚙️  Settings                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Connection                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Bridge URL:  ws://localhost:3334                        │   │
│  │  Auto-reconnect:  ● On  ○ Off                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Appearance                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Theme:  ● Dark  ○ Light  ○ System                      │   │
│  │  Font Size:  [━━━━━●━━━━━] 13px                         │   │
│  │  Animations:  ● On  ○ Off                               │   │
│  │  Particles:  ○ On  ● Off                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Audio                                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Sound Effects:  ○ On  ● Off                            │   │
│  │  Volume:  [━━●━━━━━━━━━] 30%                            │   │
│  │  Error Alerts:  ● On  ○ Off                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Stream                                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Max Events:  [1000]                                     │   │
│  │  Auto-scroll:  ● On  ○ Off                              │   │
│  │  Show Debug:  ○ On  ● Off                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│                                        [Cancel]  [Save]          │
╰─────────────────────────────────────────────────────────────────╯
```

---

## Notification System

Toast notifications for important events:

```
┌─────────────────────────────────────────────────────┐
│                                     top-right corner │
│                                                      │
│  ╭────────────────────────────────╮                 │
│  │ ✓  Task Complete               │  ← slides in   │
│  │    browser_screenshot (765ms)  │                 │
│  ╰────────────────────────────────╯                 │
│                                                      │
│  ╭────────────────────────────────╮                 │
│  │ ⚠️  Igor Crashed               │                 │
│  │    igor-002 exited unexpectedly│                 │
│  │    [View Logs]  [Dismiss]      │                 │
│  ╰────────────────────────────────╯                 │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## File Structure (Flutter)

```
dashmax/
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── theme/
│   │   ├── colors.dart
│   │   ├── typography.dart
│   │   └── theme.dart
│   ├── state/
│   │   ├── dashmax_state.dart
│   │   ├── bridge_state.dart
│   │   ├── doctor_state.dart
│   │   └── igor_state.dart
│   ├── services/
│   │   ├── websocket_service.dart
│   │   └── commands.dart
│   ├── widgets/
│   │   ├── panels/
│   │   │   ├── bridge_panel.dart
│   │   │   ├── doctor_panel.dart
│   │   │   ├── igors_panel.dart
│   │   │   └── stream_panel.dart
│   │   ├── cards/
│   │   │   ├── igor_card.dart
│   │   │   ├── swarm_card.dart
│   │   │   └── squad_card.dart
│   │   ├── charts/
│   │   │   ├── sparkline.dart
│   │   │   └── progress_bar.dart
│   │   └── common/
│   │       ├── status_dot.dart
│   │       ├── glass_panel.dart
│   │       └── animated_counter.dart
│   └── screens/
│       ├── dashboard_screen.dart
│       └── settings_screen.dart
├── assets/
│   ├── fonts/
│   └── sounds/
├── pubspec.yaml
└── README.md
```

---

## Build Targets

```yaml
# pubspec.yaml
flutter:
  # Desktop targets
  platforms:
    - macos
    - windows
    - linux

# Build commands
# flutter build macos
# flutter build windows
# flutter build linux
```

**Binary Sizes:**
| Platform | Size |
|----------|------|
| macOS | ~25MB |
| Windows | ~30MB |
| Linux | ~20MB |

---

## The Max Factor

| Feature | dash | dashmax |
|---------|------|---------|
| Framework | Hono + vanilla JS | Flutter Desktop |
| Animations | Basic CSS | 120fps native |
| Styling | Functional | Premium glassmorphism |
| Sound | None | Optional effects |
| Window | Browser tab | Native window |
| Offline | No | Yes (shows last state) |
| Command palette | No | Yes |
| Keyboard shortcuts | Basic | Full |
| Binary | None (web) | Native executable |

---

## When to Use Which

**Use dash (web) when:**
- Quick check from any machine
- No installation needed
- Embedding in other tools
- Low-resource environments

**Use dashmax (native) when:**
- Daily driver for development
- Client demos (it impresses)
- Long monitoring sessions
- Want the premium feel

Both connect to the same Bridge:3334. Run both simultaneously if you want.

---

## The Vibe

dash: "It works."
dashmax: "Holy shit, that's beautiful."

Same monster, different outfit.
