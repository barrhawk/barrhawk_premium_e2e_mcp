import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:window_manager/window_manager.dart';

import '../../state/app_state.dart';
import '../../theme/theme.dart';

class TitleBar extends StatelessWidget {
  const TitleBar({super.key});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onPanStart: (_) => windowManager.startDragging(),
      child: Container(
        height: 48,
        decoration: const BoxDecoration(
          color: BarrHawkColors.bgPanel,
          border: Border(
            bottom: BorderSide(color: BarrHawkColors.border),
          ),
        ),
        child: Row(
          children: [
            const SizedBox(width: 16),

            // Brand
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                gradient: BarrHawkColors.heroGradient,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text(
                  'B',
                  style: TextStyle(
                    fontFamily: 'sans-serif',
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              'BARRHAWK',
              style: TextStyle(
                fontFamily: 'sans-serif',
                fontWeight: FontWeight.w700,
                fontSize: 14,
                letterSpacing: 2,
                color: BarrHawkColors.textPrimary,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: BarrHawkColors.doctor.withOpacity(0.2),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                'MAX',
                style: TextStyle(
                  fontFamily: 'sans-serif',
                  fontWeight: FontWeight.w700,
                  fontSize: 9,
                  letterSpacing: 1,
                  color: BarrHawkColors.doctor,
                ),
              ),
            ),

            const Spacer(),

            // Connection status
            Consumer<AppState>(
              builder: (context, state, _) {
                return _StatusBadge(
                  connected: state.connected,
                  igorCount: state.igors.length,
                );
              },
            ),

            const SizedBox(width: 16),

            // Pause button
            Consumer<AppState>(
              builder: (context, state, _) {
                return _TitleBarButton(
                  icon: state.paused ? Icons.play_arrow : Icons.pause,
                  label: state.paused ? 'Resume' : 'Pause',
                  onTap: () => state.paused
                      ? state.resumeTraffic()
                      : state.pauseTraffic(),
                );
              },
            ),

            const SizedBox(width: 8),

            // Command palette button
            _TitleBarButton(
              icon: Icons.terminal,
              label: '⌘K',
              onTap: () => context.read<AppState>().toggleCommandPalette(),
            ),

            const SizedBox(width: 16),

            // Window controls
            _WindowButton(
              icon: Icons.remove,
              onTap: () => windowManager.minimize(),
            ),
            _WindowButton(
              icon: Icons.crop_square,
              onTap: () async {
                if (await windowManager.isMaximized()) {
                  windowManager.unmaximize();
                } else {
                  windowManager.maximize();
                }
              },
            ),
            _WindowButton(
              icon: Icons.close,
              isClose: true,
              onTap: () => windowManager.close(),
            ),

            const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final bool connected;
  final int igorCount;

  const _StatusBadge({
    required this.connected,
    required this.igorCount,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: (connected ? BarrHawkColors.ok : BarrHawkColors.error)
                .withOpacity(0.15),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: connected ? BarrHawkColors.ok : BarrHawkColors.error,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                connected ? 'Connected' : 'Disconnected',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: connected ? BarrHawkColors.ok : BarrHawkColors.error,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: BarrHawkColors.igor.withOpacity(0.15),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            '$igorCount Igor${igorCount != 1 ? 's' : ''}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: BarrHawkColors.igor,
            ),
          ),
        ),
      ],
    );
  }
}

class _TitleBarButton extends StatefulWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _TitleBarButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  State<_TitleBarButton> createState() => _TitleBarButtonState();
}

class _TitleBarButtonState extends State<_TitleBarButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: _hovering ? BarrHawkColors.bgCard : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: _hovering ? BarrHawkColors.border : Colors.transparent,
            ),
          ),
          child: Row(
            children: [
              Icon(widget.icon, size: 16, color: BarrHawkColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                widget.label,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: BarrHawkColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WindowButton extends StatefulWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool isClose;

  const _WindowButton({
    required this.icon,
    required this.onTap,
    this.isClose = false,
  });

  @override
  State<_WindowButton> createState() => _WindowButtonState();
}

class _WindowButtonState extends State<_WindowButton> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: _hovering
                ? (widget.isClose ? BarrHawkColors.error : BarrHawkColors.bgCard)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(
            widget.icon,
            size: 16,
            color: _hovering && widget.isClose
                ? Colors.white
                : BarrHawkColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
