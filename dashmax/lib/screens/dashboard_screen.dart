import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:window_manager/window_manager.dart';

import '../state/app_state.dart';
import '../theme/theme.dart';
import '../widgets/panels/bridge_panel.dart';
import '../widgets/panels/doctor_panel.dart';
import '../widgets/panels/igors_panel.dart';
import '../widgets/panels/stream_panel.dart';
import '../widgets/common/command_palette.dart';
import '../widgets/common/title_bar.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> with WindowListener {
  final FocusNode _focusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    windowManager.addListener(this);

    // Load demo data after delay if not connected
    Future.delayed(const Duration(seconds: 2), () {
      final state = context.read<AppState>();
      if (!state.connected) {
        state.loadDemoData();
      }
    });
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    _focusNode.dispose();
    super.dispose();
  }

  void _handleKeyEvent(KeyEvent event) {
    if (event is! KeyDownEvent) return;

    final state = context.read<AppState>();

    // Command palette: Ctrl/Cmd + K
    if ((HardwareKeyboard.instance.isControlPressed ||
         HardwareKeyboard.instance.isMetaPressed) &&
        event.logicalKey == LogicalKeyboardKey.keyK) {
      state.toggleCommandPalette();
      return;
    }

    // If command palette is open, let it handle keys
    if (state.commandPaletteOpen) {
      if (event.logicalKey == LogicalKeyboardKey.escape) {
        state.closeCommandPalette();
      }
      return;
    }

    // Escape closes modals
    if (event.logicalKey == LogicalKeyboardKey.escape) {
      // Close any open modals
      return;
    }

    // P toggles pause
    if (event.logicalKey == LogicalKeyboardKey.keyP &&
        !HardwareKeyboard.instance.isControlPressed &&
        !HardwareKeyboard.instance.isMetaPressed) {
      state.paused ? state.resumeTraffic() : state.pauseTraffic();
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return KeyboardListener(
      focusNode: _focusNode,
      autofocus: true,
      onKeyEvent: _handleKeyEvent,
      child: Scaffold(
        backgroundColor: BarrHawkColors.bg,
        body: Stack(
          children: [
            // Main content
            Column(
              children: [
                // Custom title bar
                const TitleBar(),

                // Dashboard content
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        // Top row: Bridge + Doctor
                        SizedBox(
                          height: 280,
                          child: Row(
                            children: [
                              const Expanded(
                                flex: 2,
                                child: BridgePanel(),
                              ),
                              const SizedBox(width: 16),
                              const Expanded(
                                flex: 3,
                                child: DoctorPanel(),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 16),

                        // Middle: Igors
                        const SizedBox(
                          height: 180,
                          child: IgorsPanel(),
                        ),

                        const SizedBox(height: 16),

                        // Bottom: Stream
                        const Expanded(
                          child: StreamPanel(),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // Command palette overlay
            Consumer<AppState>(
              builder: (context, state, _) {
                if (!state.commandPaletteOpen) return const SizedBox.shrink();
                return const CommandPalette();
              },
            ),
          ],
        ),
      ),
    );
  }
}
