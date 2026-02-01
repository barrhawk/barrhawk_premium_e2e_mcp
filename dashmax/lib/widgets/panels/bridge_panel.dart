import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../theme/theme.dart';
import '../common/glass_panel.dart';

class BridgePanel extends StatelessWidget {
  const BridgePanel({super.key});

  String _formatUptime(int seconds) {
    if (seconds <= 0) return '--';
    final h = seconds ~/ 3600;
    final m = (seconds % 3600) ~/ 60;
    final s = seconds % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        final bridge = state.bridge;

        return GlassPanel(
          borderColor: BarrHawkColors.bridge.withOpacity(0.3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelHeader(
                title: 'Bridge',
                iconColor: BarrHawkColors.bridge,
                trailing: StatusBadge(status: bridge.status),
              ),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Stats grid
                      Row(
                        children: [
                          Expanded(
                            child: _StatItem(
                              label: 'STATUS',
                              value: bridge.status,
                            ),
                          ),
                          Expanded(
                            child: _StatItem(
                              label: 'UPTIME',
                              value: _formatUptime(bridge.uptime),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: _StatItem(
                              label: 'DOCTOR',
                              value: bridge.doctorStatus,
                            ),
                          ),
                          Expanded(
                            child: _StatItem(
                              label: 'RESTARTS',
                              value: bridge.doctorRestarts.toString(),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // Throughput section
                      Text(
                        'THROUGHPUT',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          _ThroughputItem(
                            label: 'IN',
                            value: bridge.messagesIn,
                          ),
                          const SizedBox(width: 24),
                          _ThroughputItem(
                            label: 'OUT',
                            value: bridge.messagesOut,
                          ),
                        ],
                      ),

                      const SizedBox(height: 12),

                      // Sparkline placeholder
                      Container(
                        height: 30,
                        decoration: BoxDecoration(
                          color: BarrHawkColors.bgCard,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: CustomPaint(
                          painter: _SparklinePainter(
                            color: BarrHawkColors.bridge,
                          ),
                          size: const Size(double.infinity, 30),
                        ),
                      ),

                      const Spacer(),

                      // Actions
                      Row(
                        children: [
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: BarrHawkColors.error,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                            ),
                            onPressed: () => _showConfirm(
                              context,
                              'Restart Doctor?',
                              state.restartDoctor,
                            ),
                            child: const Text(
                              'Restart Doctor',
                              style: TextStyle(fontSize: 11),
                            ),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                            ),
                            onPressed: () => state.paused
                                ? state.resumeTraffic()
                                : state.pauseTraffic(),
                            child: Text(
                              state.paused ? 'Resume' : 'Pause Traffic',
                              style: const TextStyle(fontSize: 11),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showConfirm(BuildContext context, String message, VoidCallback action) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: BarrHawkColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: BarrHawkColors.border),
        ),
        title: const Text('Confirm'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: BarrHawkColors.error,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              action();
            },
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;

  const _StatItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall,
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: Theme.of(context).textTheme.titleMedium,
        ),
      ],
    );
  }
}

class _ThroughputItem extends StatelessWidget {
  final String label;
  final int value;

  const _ThroughputItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall,
        ),
        const SizedBox(width: 8),
        Text(
          value.toString(),
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: BarrHawkColors.textPrimary,
          ),
        ),
        const SizedBox(width: 4),
        Text(
          'msg',
          style: Theme.of(context).textTheme.labelSmall,
        ),
      ],
    );
  }
}

class _SparklinePainter extends CustomPainter {
  final Color color;

  _SparklinePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    // Fake sparkline data
    final data = [0.3, 0.5, 0.7, 0.6, 0.8, 0.9, 0.7, 0.8, 0.6, 0.5, 0.7, 0.8];

    final paint = Paint()
      ..color = color.withOpacity(0.5)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final path = Path();
    final stepX = size.width / (data.length - 1);

    for (var i = 0; i < data.length; i++) {
      final x = i * stepX;
      final y = size.height - (data[i] * size.height * 0.8) - 2;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    canvas.drawPath(path, paint);

    // Gradient fill
    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [color.withOpacity(0.2), color.withOpacity(0.0)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final fillPath = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();

    canvas.drawPath(fillPath, fillPaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
