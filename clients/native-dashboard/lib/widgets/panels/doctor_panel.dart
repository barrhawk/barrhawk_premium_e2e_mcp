import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../state/models.dart';
import '../../theme/theme.dart';
import '../common/glass_panel.dart';

class DoctorPanel extends StatelessWidget {
  const DoctorPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppState>(
      builder: (context, state, _) {
        final doctor = state.doctor;

        return GlassPanel(
          borderColor: BarrHawkColors.doctor.withOpacity(0.3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PanelHeader(
                title: 'Doctor',
                iconColor: BarrHawkColors.doctor,
                trailing: StatusBadge(status: doctor.status),
              ),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Left: Stats
                      SizedBox(
                        width: 140,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _StatItem(
                              label: 'ACTIVE SWARMS',
                              value: doctor.activeSwarms.toString(),
                              color: BarrHawkColors.doctor,
                            ),
                            const SizedBox(height: 12),
                            _StatItem(
                              label: 'SQUADS',
                              value: doctor.squads.toString(),
                              color: BarrHawkColors.igor,
                            ),
                            const SizedBox(height: 12),
                            _StatItem(
                              label: 'QUEUE',
                              value: doctor.queueDepth.toString(),
                              color: BarrHawkColors.warning,
                            ),
                            const Spacer(),
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: BarrHawkColors.doctor,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 10,
                                ),
                              ),
                              onPressed: () => state.spawnIgor(),
                              icon: const Icon(Icons.add, size: 16),
                              label: const Text(
                                'Spawn Igor',
                                style: TextStyle(fontSize: 11),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(width: 16),

                      // Vertical divider
                      Container(
                        width: 1,
                        color: BarrHawkColors.border,
                      ),

                      const SizedBox(width: 16),

                      // Right: Swarms list
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'ACTIVE SWARMS',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                            const SizedBox(height: 8),
                            Expanded(
                              child: doctor.swarms.isEmpty
                                  ? Center(
                                      child: Text(
                                        'No active swarms',
                                        style: TextStyle(
                                          color: BarrHawkColors.textMuted,
                                          fontSize: 12,
                                        ),
                                      ),
                                    )
                                  : ListView.separated(
                                      itemCount: doctor.swarms.length,
                                      separatorBuilder: (_, __) =>
                                          const SizedBox(height: 8),
                                      itemBuilder: (context, index) {
                                        final swarm = doctor.swarms[index];
                                        return _SwarmCard(
                                          swarm: swarm,
                                          onCancel: () =>
                                              state.cancelSwarm(swarm.id),
                                        );
                                      },
                                    ),
                            ),
                          ],
                        ),
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
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatItem({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall,
        ),
        const SizedBox(height: 4),
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Container(
              width: 4,
              height: 20,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              value,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w700,
                color: BarrHawkColors.textPrimary,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _SwarmCard extends StatelessWidget {
  final SwarmInfo swarm;
  final VoidCallback onCancel;

  const _SwarmCard({
    required this.swarm,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BarrHawkColors.bgCard,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: BarrHawkColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  swarm.name,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: BarrHawkColors.textPrimary,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: _getStatusColor(swarm.status).withOpacity(0.15),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  swarm.status.toUpperCase(),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: _getStatusColor(swarm.status),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                '${swarm.progress}%',
                style: const TextStyle(
                  fontSize: 11,
                  color: BarrHawkColors.textSecondary,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: LinearProgressIndicator(
                    value: swarm.progress / 100,
                    backgroundColor: BarrHawkColors.border,
                    valueColor: AlwaysStoppedAnimation(
                      _getStatusColor(swarm.status),
                    ),
                    minHeight: 4,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${swarm.igorsAssigned} igors',
                style: const TextStyle(
                  fontSize: 10,
                  color: BarrHawkColors.textMuted,
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: onCancel,
                borderRadius: BorderRadius.circular(4),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    Icons.close,
                    size: 14,
                    color: BarrHawkColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'running':
        return BarrHawkColors.ok;
      case 'queued':
        return BarrHawkColors.warning;
      case 'paused':
        return BarrHawkColors.idle;
      case 'error':
        return BarrHawkColors.error;
      default:
        return BarrHawkColors.idle;
    }
  }
}
