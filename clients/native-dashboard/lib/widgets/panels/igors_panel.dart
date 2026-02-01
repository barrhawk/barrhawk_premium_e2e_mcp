import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../state/models.dart';
import '../../theme/theme.dart';
import '../common/glass_panel.dart';

class IgorsPanel extends StatelessWidget {
  const IgorsPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        final igors = state.igors.values.toList();

        return GlassPanel(
          borderColor: BarrHawkColors.igor.withOpacity(0.3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelHeader(
                title: 'Igors',
                iconColor: BarrHawkColors.igor,
                trailing: Row(
                  children: [
                    Text(
                      '${igors.length} active',
                      style: const TextStyle(
                        fontSize: 11,
                        color: BarrHawkColors.textMuted,
                      ),
                    ),
                    const SizedBox(width: 12),
                    InkWell(
                      onTap: () => state.spawnIgor(),
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: BarrHawkColors.igor.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Icon(
                          Icons.add,
                          size: 16,
                          color: BarrHawkColors.igor,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              Expanded(
                child: igors.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.smart_toy_outlined,
                              size: 32,
                              color: BarrHawkColors.textMuted,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'No Igors spawned',
                              style: TextStyle(
                                color: BarrHawkColors.textMuted,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      )
                    : Padding(
                        padding: const EdgeInsets.all(12),
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: igors.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 12),
                          itemBuilder: (context, index) {
                            final igor = igors[index];
                            return _IgorCard(
                              igor: igor,
                              onKill: () => _showKillConfirm(
                                context,
                                igor.id,
                                () => state.killIgor(igor.id),
                              ),
                            );
                          },
                        ),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showKillConfirm(
    BuildContext context,
    String igorId,
    VoidCallback onConfirm,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: BarrHawkColors.bgPanel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: BarrHawkColors.border),
        ),
        title: const Text('Kill Igor?'),
        content: Text('Are you sure you want to terminate $igorId?'),
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
              onConfirm();
            },
            child: const Text('Kill'),
          ),
        ],
      ),
    );
  }
}

class _IgorCard extends StatefulWidget {
  final IgorState igor;
  final VoidCallback onKill;

  const _IgorCard({
    required this.igor,
    required this.onKill,
  });

  @override
  State<_IgorCard> createState() => _IgorCardState();
}

class _IgorCardState extends State<_IgorCard> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final igor = widget.igor;
    final domainColor = _getDomainColor(igor.domain);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 180,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: BarrHawkColors.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: _hovering
                ? domainColor.withOpacity(0.5)
                : BarrHawkColors.border,
          ),
          boxShadow: _hovering
              ? [
                  BoxShadow(
                    color: domainColor.withOpacity(0.1),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: domainColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text(
                      _getDomainIcon(igor.domain),
                      style: const TextStyle(fontSize: 16),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        igor.id,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: BarrHawkColors.textPrimary,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        igor.domain.toUpperCase(),
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.5,
                          color: domainColor,
                        ),
                      ),
                    ],
                  ),
                ),
                _StatusDot(status: igor.status),
              ],
            ),

            const Spacer(),

            // Resources
            Row(
              children: [
                _ResourceBar(
                  icon: Icons.memory,
                  value: igor.cpu,
                  color: BarrHawkColors.bridge,
                ),
                const SizedBox(width: 8),
                _ResourceBar(
                  icon: Icons.storage,
                  value: igor.memory,
                  color: BarrHawkColors.doctor,
                ),
              ],
            ),

            const SizedBox(height: 8),

            // Current task
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: BarrHawkColors.bg,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                igor.currentTask?.tool ?? 'Idle',
                style: const TextStyle(
                  fontSize: 10,
                  color: BarrHawkColors.textMuted,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),

            // Kill button on hover
            if (_hovering) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  style: TextButton.styleFrom(
                    backgroundColor: BarrHawkColors.error.withOpacity(0.1),
                    padding: const EdgeInsets.symmetric(vertical: 4),
                  ),
                  onPressed: widget.onKill,
                  child: const Text(
                    'Kill',
                    style: TextStyle(
                      fontSize: 10,
                      color: BarrHawkColors.error,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _getDomainColor(String domain) {
    switch (domain.toLowerCase()) {
      case 'browser':
        return BarrHawkColors.bridge;
      case 'api':
        return BarrHawkColors.doctor;
      case 'mcp':
        return BarrHawkColors.igor;
      case 'network':
        return BarrHawkColors.warning;
      default:
        return BarrHawkColors.idle;
    }
  }

  String _getDomainIcon(String domain) {
    switch (domain.toLowerCase()) {
      case 'browser':
        return '🌐';
      case 'api':
        return '🔌';
      case 'mcp':
        return '🤖';
      case 'network':
        return '📡';
      default:
        return '⚙️';
    }
  }
}

class _StatusDot extends StatelessWidget {
  final String status;

  const _StatusDot({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    switch (status.toLowerCase()) {
      case 'busy':
        color = BarrHawkColors.warning;
        break;
      case 'ready':
        color = BarrHawkColors.ok;
        break;
      case 'error':
        color = BarrHawkColors.error;
        break;
      default:
        color = BarrHawkColors.idle;
    }

    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.5),
            blurRadius: 4,
          ),
        ],
      ),
    );
  }
}

class _ResourceBar extends StatelessWidget {
  final IconData icon;
  final int value;
  final Color color;

  const _ResourceBar({
    required this.icon,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Row(
        children: [
          Icon(icon, size: 12, color: BarrHawkColors.textMuted),
          const SizedBox(width: 4),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: value / 100,
                backgroundColor: BarrHawkColors.border,
                valueColor: AlwaysStoppedAnimation(color),
                minHeight: 3,
              ),
            ),
          ),
          const SizedBox(width: 4),
          Text(
            '$value%',
            style: const TextStyle(
              fontSize: 9,
              color: BarrHawkColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
